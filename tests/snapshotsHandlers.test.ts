import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerSnapshotsHandlers } from '../electron/ipc/snapshotsHandlers';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';

// Covers the W5 PR 10 extraction: registerSnapshotsHandlers wires the four
// snapshots:* channels (all ipcMain.handle) and preserves load/create/load-
// payload/restore behavior verbatim -- including the TOCTOU-sensitive restore
// (hash-verify gate BEFORE touching live files, temp-tree write-then-swap, temp
// cleanup on success AND failure). fs effects are isolated to a real temp dir;
// all four DATA_DIR-bound resolvers are faked to point at separate temp subdirs.

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
let snapshotsDir: string;
let evalsDir: string;
let timelineDir: string;
let govDir: string;

function setup() {
  const ipc = makeFakeIpcMain();
  registerSnapshotsHandlers({
    ipcMain: ipc as any,
    getSnapshotsDir: () => snapshotsDir,
    getEvalsDir: () => evalsDir,
    getTimelineDir: () => timelineDir,
    getGovernanceDir: () => govDir,
  });
  return { ipc };
}

const snapFile = (id: string) => path.join(snapshotsDir, `snapshot-${id}.json`);
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-test-'));
  snapshotsDir = path.join(tmpDir, 'snapshots');
  evalsDir = path.join(tmpDir, 'evals');
  timelineDir = path.join(tmpDir, 'timeline');
  govDir = path.join(tmpDir, 'governance');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('registerSnapshotsHandlers — registration', () => {
  it('registers exactly the four snapshot channels, all via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual(['snapshots:create', 'snapshots:load-all', 'snapshots:load-payload', 'snapshots:restore']);
    for (const ch of ['snapshots:create', 'snapshots:load-all', 'snapshots:load-payload', 'snapshots:restore']) {
      expect(ipc.styleOf(ch)).toBe('handle');
    }
  });
});

describe('snapshots:load-all', () => {
  it('creates the dir and returns [] when none exist', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('snapshots:load-all', { rootPath: null, presetId: 'tm4' })).toEqual([]);
    expect(fs.existsSync(snapshotsDir)).toBe(true);
  });

  it('returns manifests with integrityStatus, sorted descending by createdAt, skipping temp_ and non-json', async () => {
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const mk = (id: string, createdAt: string) => {
      const snap: any = { manifest: { snapshotId: id, createdAt, description: id }, payload: { a: 1 } };
      snap.manifest.hash = computeHash(snap);
      fs.writeFileSync(snapFile(id), JSON.stringify(snap), 'utf-8');
    };
    mk('old', '2026-01-01T00:00:00.000Z');
    mk('new', '2026-06-01T00:00:00.000Z');
    // A tampered one (wrong hash).
    const bad: any = { manifest: { snapshotId: 'bad', createdAt: '2026-03-01T00:00:00.000Z', hash: 'wrong' }, payload: {} };
    fs.writeFileSync(snapFile('bad'), JSON.stringify(bad), 'utf-8');
    // Noise that must be ignored.
    fs.writeFileSync(path.join(snapshotsDir, 'temp_restore_123.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(snapshotsDir, 'notes.txt'), 'x', 'utf-8');

    const { ipc } = setup();
    const list = await ipc.invoke('snapshots:load-all', { rootPath: null, presetId: 'tm4' });
    expect(list.map((s: any) => s.snapshotId)).toEqual(['new', 'bad', 'old']); // desc by createdAt
    expect(list.find((s: any) => s.snapshotId === 'new').integrityStatus).toBe('verified');
    expect(list.find((s: any) => s.snapshotId === 'bad').integrityStatus).toBe('tampered');
  });
});

describe('snapshots:create', () => {
  it('builds a sealed snapshot file and returns the verified manifest', async () => {
    const { ipc } = setup();
    const payload = { policies: { minScore: 0.9 }, benchmarks: [{ id: 'b' }] };
    const manifest = await ipc.invoke('snapshots:create', {
      rootPath: null, presetId: 'tm4', description: 'my snap', type: 'manual', payload, parentSnapshotId: undefined,
    });

    expect(manifest.snapshotId).toMatch(/^snap-/);
    expect(manifest.schemaVersion).toBe('agentdeck.snapshot.v1');
    expect(manifest.description).toBe('my snap');
    expect(manifest.integrityStatus).toBe('verified');
    expect(manifest.parentSnapshotId).toBeUndefined();

    // Persisted file exists, is pretty-printed, and self-verifies.
    const p = snapFile(manifest.snapshotId);
    expect(fs.existsSync(p)).toBe(true);
    const onDisk = readJson(p);
    expect(fs.readFileSync(p, 'utf-8')).toBe(JSON.stringify(onDisk, null, 2));
    expect(verifyHash(onDisk)).toBe('verified');
    expect(onDisk.payload).toEqual(payload);
  });

  it('includes parentSnapshotId when provided', async () => {
    const { ipc } = setup();
    const manifest = await ipc.invoke('snapshots:create', {
      rootPath: null, presetId: 'tm4', description: 'child', type: 'auto', payload: {}, parentSnapshotId: 'snap-parent',
    });
    expect(manifest.parentSnapshotId).toBe('snap-parent');
  });
});

describe('snapshots:load-payload', () => {
  it('returns the stored payload for an existing snapshot', async () => {
    const { ipc } = setup();
    const payload = { foo: 'bar', list: [1, 2, 3] };
    const m = await ipc.invoke('snapshots:create', { rootPath: null, presetId: 'tm4', description: 'd', type: 't', payload });
    const loaded = await ipc.invoke('snapshots:load-payload', { rootPath: null, presetId: 'tm4', snapshotId: m.snapshotId });
    expect(loaded).toEqual(payload);
  });

  it('throws when the snapshot does not exist', async () => {
    const { ipc } = setup();
    await expect(ipc.invoke('snapshots:load-payload', { rootPath: null, presetId: 'tm4', snapshotId: 'snap-missing' }))
      .rejects.toThrow(/not found/);
  });
});

describe('snapshots:restore — TOCTOU-sensitive path', () => {
  const richPayload = {
    manifest: { name: 'WS' },
    policies: { minScore: 0.8 },
    releaseCandidates: [{ id: 'rc1' }],
    benchmarks: [{ id: 'b1' }],
    judges: [{ id: 'j1' }],
    promotions: [{ runId: 'r1' }],
    regressionRuns: [{ id: 'run1' }],
    failures: [{ id: 'f1' }],
    goldStandards: [{ id: 'g1' }],
    timelineEvents: [{ id: 'ev1' }],
  };

  it('fails cleanly when the snapshot does not exist (no temp dir left behind)', async () => {
    const { ipc } = setup();
    const res = await ipc.invoke('snapshots:restore', { rootPath: null, presetId: 'tm4', snapshotId: 'snap-missing' });
    expect(res).toEqual({ success: false, error: 'Snapshot snap-missing does not exist.' });
    // No temp_restore_* dirs left.
    fs.mkdirSync(snapshotsDir, { recursive: true });
    expect(fs.readdirSync(snapshotsDir).filter((f) => f.startsWith('temp_restore_'))).toEqual([]);
  });

  it('blocks restore when the snapshot hash is tampered (verify gate BEFORE any swap)', async () => {
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const bad: any = { manifest: { snapshotId: 'snap-bad', hash: 'wrong' }, payload: richPayload };
    fs.writeFileSync(snapFile('snap-bad'), JSON.stringify(bad), 'utf-8');

    const { ipc } = setup();
    const res = await ipc.invoke('snapshots:restore', { rootPath: null, presetId: 'tm4', snapshotId: 'snap-bad' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Restore blocked: Snapshot hash integrity check failed \(TAMPERED\)/);
    // Live dirs were never written.
    expect(fs.existsSync(path.join(govDir, 'policies.json'))).toBe(false);
    expect(fs.existsSync(evalsDir)).toBe(false);
    // No temp dir left behind.
    expect(fs.readdirSync(snapshotsDir).filter((f) => f.startsWith('temp_restore_'))).toEqual([]);
  });

  it('restores a verified snapshot into governance/evals/timeline and cleans up the temp dir', async () => {
    const { ipc } = setup();
    // Seed a verified snapshot via the create handler (correct hash).
    const m = await ipc.invoke('snapshots:create', { rootPath: null, presetId: 'tm4', description: 'd', type: 't', payload: richPayload });

    const res = await ipc.invoke('snapshots:restore', { rootPath: null, presetId: 'tm4', snapshotId: m.snapshotId });
    expect(res).toEqual({ success: true });

    // Governance files swapped in.
    expect(readJson(path.join(govDir, 'policies.json'))).toEqual(richPayload.policies);
    expect(readJson(path.join(govDir, 'release_candidates.json'))).toEqual(richPayload.releaseCandidates);
    // Evals files swapped in.
    expect(readJson(path.join(evalsDir, 'benchmarks.json'))).toEqual(richPayload.benchmarks);
    expect(readJson(path.join(evalsDir, 'judges.json'))).toEqual(richPayload.judges);
    expect(readJson(path.join(evalsDir, 'promotions.json'))).toEqual(richPayload.promotions);
    expect(readJson(path.join(evalsDir, 'regression_runs.json'))).toEqual(richPayload.regressionRuns);
    // Failure + gold-standard folders populated per-file.
    expect(readJson(path.join(evalsDir, 'failures', 'fail-f1.json'))).toEqual({ id: 'f1' });
    expect(readJson(path.join(evalsDir, 'gold-standards', 'gold-g1.json'))).toEqual({ id: 'g1' });
    // Timeline events folder populated.
    expect(readJson(path.join(timelineDir, 'event-ev1.json'))).toEqual({ id: 'ev1' });
    // Temp restore dir cleaned up.
    expect(fs.readdirSync(snapshotsDir).filter((f) => f.startsWith('temp_restore_'))).toEqual([]);
  });

  it('restores workspace.json for a non-preset with a rootPath', async () => {
    const { ipc } = setup();
    const rootPath = path.join(tmpDir, 'userws');
    fs.mkdirSync(path.join(rootPath, '.agentdeck'), { recursive: true });
    const m = await ipc.invoke('snapshots:create', { rootPath, presetId: 'custom', description: 'd', type: 't', payload: richPayload });

    const res = await ipc.invoke('snapshots:restore', { rootPath, presetId: 'custom', snapshotId: m.snapshotId });
    expect(res).toEqual({ success: true });
    expect(readJson(path.join(rootPath, '.agentdeck', 'workspace.json'))).toEqual(richPayload.manifest);
  });
});
