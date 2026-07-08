import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerEvalsHandlers } from '../electron/ipc/evalsHandlers';

// Covers the W5 PR 9 extraction: registerEvalsHandlers wires the nine evals:*
// channels (all ipcMain.handle) and preserves load/save/delete behavior
// verbatim -- preset/default seeding for all six categories, raw (NON-stamped)
// data on load, per-file failure/gold-standard dirs, assertSafeId filename
// sanitization, unlink deletes, JSON.stringify(..., null, 2) formatting, and
// error handling. fs effects are isolated to a real temp dir; getEvalsDir is
// faked to point there. Evals persistence does NOT compute/verify checksums, so
// no integrityStatus stamping is expected.

function makeFakeIpcMain() {
  const handlers = new Map<string, { style: 'handle' | 'on'; fn: (...args: any[]) => any }>();
  return {
    handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, { style: 'handle', fn }),
    on: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, { style: 'on', fn }),
    invoke: (channel: string, ...args: any[]) => handlers.get(channel)!.fn(null, ...args),
    styleOf: (channel: string) => handlers.get(channel)?.style,
    channels: () => [...handlers.keys()],
  };
}

let tmpDir: string;
let evalsDir: string;

function setup(opts: { dirOverride?: string } = {}) {
  const ipc = makeFakeIpcMain();
  const getEvalsDir = () => opts.dirOverride ?? evalsDir;
  registerEvalsHandlers({ ipcMain: ipc as any, getEvalsDir });
  return { ipc };
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evals-test-'));
  // Nested so the handlers' mkdirSync(..., {recursive}) branches are exercised.
  evalsDir = path.join(tmpDir, 'ws', 'evals');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const ALL_CHANNELS = [
  'evals:load-data', 'evals:save-benchmarks', 'evals:save-failure', 'evals:delete-failure',
  'evals:save-regression-history', 'evals:save-gold-standard', 'evals:delete-gold-standard',
  'evals:save-judges', 'evals:save-promotions',
];

describe('registerEvalsHandlers — registration', () => {
  it('registers exactly the nine evals channels, all via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual([...ALL_CHANNELS].sort());
    for (const ch of ALL_CHANNELS) expect(ipc.styleOf(ch)).toBe('handle');
  });
});

describe('evals:load-data — preset/default seeding (no files)', () => {
  it('sound-machina seeds all six categories', async () => {
    const { ipc } = setup();
    const r = await ipc.invoke('evals:load-data', { rootPath: null, presetId: 'sound-machina' });
    expect(r.benchmarks.map((b: any) => b.id)).toEqual(['sound-machina-prompt-quality']);
    expect(r.benchmarks[0].testCases.map((t: any) => t.id)).toEqual(['tc-suno-1', 'tc-suno-2']);
    expect(r.runs.map((x: any) => x.id)).toEqual(['run-sound-machina-1', 'run-sound-machina-2']);
    expect(r.failures.map((x: any) => x.id)).toEqual(['fail-sound-machina-1']);
    expect(r.goldStandards.map((x: any) => x.id)).toEqual(['gold_suno_ambient', 'gold_youtube_synthwave']);
    expect(r.judges.map((x: any) => x.id)).toEqual(['suno-prompt-judge']);
    expect(r.promotions).toHaveLength(1);
    expect(r.promotions[0].runId).toBe('run-sound-machina-1');
  });

  it('tm4 seeds benchmarks/runs/goldStandards/judges but not failures/promotions', async () => {
    const { ipc } = setup();
    const r = await ipc.invoke('evals:load-data', { rootPath: null, presetId: 'tm4' });
    expect(r.benchmarks.map((b: any) => b.id)).toEqual(['tm4-governance']);
    expect(r.runs.map((x: any) => x.id)).toEqual(['run-tm4-1']);
    expect(r.failures).toEqual([]);
    expect(r.goldStandards.map((x: any) => x.id)).toEqual(['gold_tm4_arch_report']);
    expect(r.judges.map((x: any) => x.id)).toEqual(['tm4-audit-judge']);
    expect(r.promotions).toEqual([]);
  });

  it('generic preset seeds a derived benchmark + default judge, empties elsewhere', async () => {
    const { ipc } = setup();
    const r = await ipc.invoke('evals:load-data', { rootPath: null, presetId: 'my-proj' });
    expect(r.benchmarks[0].id).toBe('my-proj-evals');
    expect(r.benchmarks[0].name).toBe('my-proj Standard Evaluation');
    expect(r.runs).toEqual([]);
    expect(r.failures).toEqual([]);
    expect(r.goldStandards).toEqual([]);
    expect(r.judges.map((x: any) => x.id)).toEqual(['default-judge']);
    expect(r.promotions).toEqual([]);
  });
});

describe('evals:load-data — existing files returned raw (no integrity stamping)', () => {
  it('returns parsed benchmarks/runs/judges/promotions verbatim, with no added fields', async () => {
    fs.mkdirSync(evalsDir, { recursive: true });
    const benchmarks = [{ id: 'b1', name: 'B', hash: 'preexisting' }];
    const runs = [{ id: 'r1', score: 0.5 }];
    const judges = [{ id: 'j1', threshold: 0.7 }];
    const promotions = [{ runId: 'r1' }];
    fs.writeFileSync(path.join(evalsDir, 'benchmarks.json'), JSON.stringify(benchmarks), 'utf-8');
    fs.writeFileSync(path.join(evalsDir, 'regression_runs.json'), JSON.stringify(runs), 'utf-8');
    fs.writeFileSync(path.join(evalsDir, 'judges.json'), JSON.stringify(judges), 'utf-8');
    fs.writeFileSync(path.join(evalsDir, 'promotions.json'), JSON.stringify(promotions), 'utf-8');

    const { ipc } = setup();
    const r = await ipc.invoke('evals:load-data', { rootPath: null, presetId: 'anything' });
    // Exact round-trip -- no integrityStatus stamping, hash left untouched.
    expect(r.benchmarks).toEqual(benchmarks);
    expect(r.benchmarks[0].integrityStatus).toBeUndefined();
    expect(r.runs).toEqual(runs);
    expect(r.judges).toEqual(judges);
    expect(r.promotions).toEqual(promotions);
  });

  it('reads failures + gold-standards from their dirs, skipping non-.json and corrupt files', async () => {
    const failuresDir = path.join(evalsDir, 'failures');
    const goldDir = path.join(evalsDir, 'gold-standards');
    fs.mkdirSync(failuresDir, { recursive: true });
    fs.mkdirSync(goldDir, { recursive: true });
    fs.writeFileSync(path.join(failuresDir, 'failure-a.json'), JSON.stringify({ id: 'a' }), 'utf-8');
    fs.writeFileSync(path.join(failuresDir, 'notes.txt'), 'ignore', 'utf-8');
    fs.writeFileSync(path.join(failuresDir, 'failure-bad.json'), '{ corrupt', 'utf-8');
    fs.writeFileSync(path.join(goldDir, 'gold-x.json'), JSON.stringify({ id: 'x' }), 'utf-8');
    // benchmarks/runs absent -> seeded, but that's fine; we assert the dir-loaded parts.

    const { ipc } = setup();
    const r = await ipc.invoke('evals:load-data', { rootPath: null, presetId: 'custom' });
    expect(r.failures.map((x: any) => x.id)).toEqual(['a']); // corrupt skipped, txt ignored
    expect(r.goldStandards.map((x: any) => x.id)).toEqual(['x']);
  });

  it('returns the all-empty shape when the resolver throws (outer catch)', async () => {
    // Force the load-data try/catch: the injected resolver throws.
    const ipc = makeFakeIpcMain();
    registerEvalsHandlers({
      ipcMain: ipc as any,
      getEvalsDir: () => { throw new Error('resolver boom'); },
    });
    const r = await ipc.invoke('evals:load-data', { rootPath: null, presetId: 'custom' });
    expect(r).toEqual({ benchmarks: [], runs: [], failures: [], goldStandards: [], judges: [], promotions: [] });
  });

  it('reads existing failures/gold dirs that ARE real directories without error', async () => {
    // Guards against a regression where readdirSync on a non-dir would throw:
    // both dirs are proper directories here, so no exception escapes.
    fs.mkdirSync(path.join(evalsDir, 'failures'), { recursive: true });
    fs.mkdirSync(path.join(evalsDir, 'gold-standards'), { recursive: true });
    const { ipc } = setup();
    const r = await ipc.invoke('evals:load-data', { rootPath: null, presetId: 'tm4' });
    expect(r.failures).toEqual([]);
    expect(r.goldStandards).toEqual([]);
  });
});

describe('evals save/delete handlers', () => {
  it('save-benchmarks writes benchmarks.json (2-space), returns true, creating evalsDir', async () => {
    const { ipc } = setup();
    const benchmarks = [{ id: 'b1' }];
    expect(await ipc.invoke('evals:save-benchmarks', { rootPath: null, presetId: 'c', benchmarks })).toBe(true);
    const p = path.join(evalsDir, 'benchmarks.json');
    expect(readJson(p)).toEqual(benchmarks);
    expect(fs.readFileSync(p, 'utf-8')).toBe(JSON.stringify(benchmarks, null, 2));
  });

  it('save-regression-history writes regression_runs.json', async () => {
    const { ipc } = setup();
    const history = [{ id: 'run-1' }];
    expect(await ipc.invoke('evals:save-regression-history', { rootPath: null, presetId: 'c', history })).toBe(true);
    expect(readJson(path.join(evalsDir, 'regression_runs.json'))).toEqual(history);
  });

  it('save-judges and save-promotions write judges.json / promotions.json', async () => {
    const { ipc } = setup();
    await ipc.invoke('evals:save-judges', { rootPath: null, presetId: 'c', list: [{ id: 'j' }] });
    await ipc.invoke('evals:save-promotions', { rootPath: null, presetId: 'c', list: [{ runId: 'r' }] });
    expect(readJson(path.join(evalsDir, 'judges.json'))).toEqual([{ id: 'j' }]);
    expect(readJson(path.join(evalsDir, 'promotions.json'))).toEqual([{ runId: 'r' }]);
  });

  it('save-failure writes failures/failure-<id>.json and delete-failure removes it', async () => {
    const { ipc } = setup();
    const failure = { id: 'f1', prompt: 'p' };
    expect(await ipc.invoke('evals:save-failure', { rootPath: null, presetId: 'c', failure })).toBe(true);
    const p = path.join(evalsDir, 'failures', 'failure-f1.json');
    expect(readJson(p)).toEqual(failure);
    expect(fs.readFileSync(p, 'utf-8')).toBe(JSON.stringify(failure, null, 2));

    expect(await ipc.invoke('evals:delete-failure', { rootPath: null, presetId: 'c', failureId: 'f1' })).toBe(true);
    expect(fs.existsSync(p)).toBe(false);
    // Deleting again (now missing) returns false.
    expect(await ipc.invoke('evals:delete-failure', { rootPath: null, presetId: 'c', failureId: 'f1' })).toBe(false);
  });

  it('save-gold-standard writes gold-standards/gold-<id>.json and delete-gold-standard removes it', async () => {
    const { ipc } = setup();
    const item = { id: 'g1', title: 'T' };
    expect(await ipc.invoke('evals:save-gold-standard', { rootPath: null, presetId: 'c', item })).toBe(true);
    const p = path.join(evalsDir, 'gold-standards', 'gold-g1.json');
    expect(readJson(p)).toEqual(item);

    expect(await ipc.invoke('evals:delete-gold-standard', { rootPath: null, presetId: 'c', id: 'g1' })).toBe(true);
    expect(fs.existsSync(p)).toBe(false);
    expect(await ipc.invoke('evals:delete-gold-standard', { rootPath: null, presetId: 'c', id: 'g1' })).toBe(false);
  });

  it('rejects unsafe ids via assertSafeId (save + delete return false, no traversal write)', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('evals:save-failure', { rootPath: null, presetId: 'c', failure: { id: '../evil' } })).toBe(false);
    expect(await ipc.invoke('evals:save-gold-standard', { rootPath: null, presetId: 'c', item: { id: '../evil' } })).toBe(false);
    expect(await ipc.invoke('evals:delete-failure', { rootPath: null, presetId: 'c', failureId: '../evil' })).toBe(false);
    expect(await ipc.invoke('evals:delete-gold-standard', { rootPath: null, presetId: 'c', id: '../evil' })).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'ws', 'evil.json'))).toBe(false);
  });

  it('save handlers return false when the target dir cannot be created', async () => {
    const blocker = path.join(tmpDir, 'blk2');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const { ipc } = setup({ dirOverride: path.join(blocker, 'evals') });
    expect(await ipc.invoke('evals:save-benchmarks', { rootPath: null, presetId: 'c', benchmarks: [] })).toBe(false);
    expect(await ipc.invoke('evals:save-judges', { rootPath: null, presetId: 'c', list: [] })).toBe(false);
  });
});
