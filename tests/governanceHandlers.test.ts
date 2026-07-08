import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerGovernanceHandlers } from '../electron/ipc/governanceHandlers';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';

// Covers the W5 PR 7 extraction: registerGovernanceHandlers wires the three
// governance:* channels (all ipcMain.handle) and preserves load/save behavior
// verbatim -- preset default policies/candidate seeds, integrity stamping via
// verifyHash, computeHash sealing, JSON.stringify(..., null, 2) formatting, and
// error handling. fs effects are isolated to a real temp dir; getGovernanceDir
// is faked to point there (mirroring main.ts's DATA_DIR-bound resolver).

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
let govDir: string;

function setup(opts: { govDirOverride?: string } = {}) {
  const ipc = makeFakeIpcMain();
  const getGovernanceDir = () => opts.govDirOverride ?? govDir;
  registerGovernanceHandlers({ ipcMain: ipc as any, getGovernanceDir });
  return { ipc };
}

const policiesPath = () => path.join(govDir, 'policies.json');
const candidatesPath = () => path.join(govDir, 'release_candidates.json');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-test-'));
  // Nested so the handlers' mkdirSync(govDir, {recursive}) branch is exercised.
  govDir = path.join(tmpDir, 'ws', 'governance');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('registerGovernanceHandlers — registration', () => {
  it('registers exactly the three governance channels, all via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual(['governance:load-data', 'governance:save-candidates', 'governance:save-policies']);
    for (const ch of ['governance:load-data', 'governance:save-candidates', 'governance:save-policies']) {
      expect(ipc.styleOf(ch)).toBe('handle');
    }
  });
});

describe('governance:load-data — seeding defaults when files are missing', () => {
  it('sound-machina seeds requireApproval-true policies + one demo candidate, persisted with hashes', async () => {
    const { ipc } = setup();
    const result = await ipc.invoke('governance:load-data', { rootPath: null, presetId: 'sound-machina' });

    expect(result.policies).toMatchObject({
      schemaVersion: 'agentdeck.governance.v1', minScore: 0.80, allowRegression: false, requireApproval: true, integrityStatus: 'verified',
    });
    expect(result.policies.hash).toBe(computeHash({ schemaVersion: 'agentdeck.governance.v1', minScore: 0.80, allowRegression: false, requireApproval: true }));
    expect(result.releaseCandidates).toHaveLength(1);
    expect(result.releaseCandidates[0].id).toBe('rc-seed-sm-1');
    expect(result.releaseCandidates[0].integrityStatus).toBe('verified');
    expect(verifyHash(result.releaseCandidates[0])).toBe('verified');

    // Persisted to disk with the same content.
    expect(readJson(policiesPath()).minScore).toBe(0.80);
    expect(readJson(candidatesPath())[0].id).toBe('rc-seed-sm-1');
  });

  it('tm4 seeds minScore 0.95 policies + rc-seed-tm-1', async () => {
    const { ipc } = setup();
    const result = await ipc.invoke('governance:load-data', { rootPath: null, presetId: 'tm4' });
    expect(result.policies.minScore).toBe(0.95);
    expect(result.policies.requireApproval).toBe(true);
    expect(result.releaseCandidates).toHaveLength(1);
    expect(result.releaseCandidates[0].id).toBe('rc-seed-tm-1');
    expect(result.releaseCandidates[0].status).toBe('released');
  });

  it('non-preset seeds requireApproval-false policies and an empty candidates file', async () => {
    const { ipc } = setup();
    const result = await ipc.invoke('governance:load-data', { rootPath: null, presetId: 'custom-xyz' });
    expect(result.policies.requireApproval).toBe(false);
    expect(result.policies.minScore).toBe(0.80);
    expect(result.releaseCandidates).toEqual([]);
    // An empty array file is written for non-presets.
    expect(readJson(candidatesPath())).toEqual([]);
  });

  it('seeded files are pretty-printed (2-space indent)', async () => {
    const { ipc } = setup();
    await ipc.invoke('governance:load-data', { rootPath: null, presetId: 'sound-machina' });
    const raw = fs.readFileSync(policiesPath(), 'utf-8');
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 2));
  });
});

describe('governance:load-data — loading existing files', () => {
  it('stamps integrityStatus via verifyHash and does not overwrite existing files', async () => {
    fs.mkdirSync(govDir, { recursive: true });
    const goodPolicies: any = { schemaVersion: 'agentdeck.governance.v1', minScore: 0.5 };
    goodPolicies.hash = computeHash(goodPolicies);
    fs.writeFileSync(policiesPath(), JSON.stringify(goodPolicies), 'utf-8');

    const okRc: any = { id: 'rc-ok', score: 0.9 };
    okRc.hash = computeHash(okRc);
    const tamperedRc: any = { id: 'rc-bad', score: 0.1, hash: 'nope' };
    fs.writeFileSync(candidatesPath(), JSON.stringify([okRc, tamperedRc]), 'utf-8');

    const { ipc } = setup();
    const result = await ipc.invoke('governance:load-data', { rootPath: null, presetId: 'custom' });

    expect(result.policies.integrityStatus).toBe('verified');
    expect(result.policies.minScore).toBe(0.5); // not reseeded
    expect(result.releaseCandidates.find((r: any) => r.id === 'rc-ok').integrityStatus).toBe('verified');
    expect(result.releaseCandidates.find((r: any) => r.id === 'rc-bad').integrityStatus).toBe('tampered');
  });

  it('flags tampered policies (content changed after hashing)', async () => {
    fs.mkdirSync(govDir, { recursive: true });
    const p: any = { schemaVersion: 'agentdeck.governance.v1', minScore: 0.5 };
    p.hash = computeHash(p);
    p.minScore = 0.99; // mutate after hashing
    fs.writeFileSync(policiesPath(), JSON.stringify(p), 'utf-8');
    const { ipc } = setup();
    const result = await ipc.invoke('governance:load-data', { rootPath: null, presetId: 'custom' });
    expect(result.policies.integrityStatus).toBe('tampered');
  });

  it('returns the default error shape when the governance dir path is unusable', async () => {
    // Point govDir at a path whose parent is a file, so mkdirSync throws.
    const blocker = path.join(tmpDir, 'blk');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const { ipc } = setup({ govDirOverride: path.join(blocker, 'gov') });
    const result = await ipc.invoke('governance:load-data', { rootPath: null, presetId: 'custom' });
    expect(result).toEqual({ policies: null, releaseCandidates: [] });
  });
});

describe('governance:save-policies', () => {
  it('hashes and writes policies.json (2-space), returns true, creating govDir', async () => {
    const { ipc } = setup();
    const policies: any = { schemaVersion: 'agentdeck.governance.v1', minScore: 0.7, allowRegression: true };
    const ok = await ipc.invoke('governance:save-policies', { rootPath: null, presetId: 'custom', policies });
    expect(ok).toBe(true);

    const saved = readJson(policiesPath());
    expect(saved.hash).toBe(computeHash({ schemaVersion: 'agentdeck.governance.v1', minScore: 0.7, allowRegression: true }));
    expect(saved.minScore).toBe(0.7);
    const raw = fs.readFileSync(policiesPath(), 'utf-8');
    expect(raw).toBe(JSON.stringify(saved, null, 2));
  });

  it('returns false when the write fails', async () => {
    const blocker = path.join(tmpDir, 'blk2');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const { ipc } = setup({ govDirOverride: path.join(blocker, 'gov') });
    const ok = await ipc.invoke('governance:save-policies', { rootPath: null, presetId: 'custom', policies: { a: 1 } });
    expect(ok).toBe(false);
  });
});

describe('governance:save-candidates', () => {
  it('hashes each candidate and writes release_candidates.json (2-space), returns true', async () => {
    const { ipc } = setup();
    const list = [{ id: 'rc1', score: 0.8 }, { id: 'rc2', score: 0.9 }];
    const ok = await ipc.invoke('governance:save-candidates', { rootPath: null, presetId: 'custom', list });
    expect(ok).toBe(true);

    const saved = readJson(candidatesPath());
    expect(saved.map((r: any) => r.id)).toEqual(['rc1', 'rc2']);
    expect(saved[0].hash).toBe(computeHash({ id: 'rc1', score: 0.8 }));
    expect(saved[1].hash).toBe(computeHash({ id: 'rc2', score: 0.9 }));
    const raw = fs.readFileSync(candidatesPath(), 'utf-8');
    expect(raw).toBe(JSON.stringify(saved, null, 2));
  });

  it('returns false when the write fails', async () => {
    const blocker = path.join(tmpDir, 'blk3');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const { ipc } = setup({ govDirOverride: path.join(blocker, 'gov') });
    const ok = await ipc.invoke('governance:save-candidates', { rootPath: null, presetId: 'custom', list: [{ id: 'x' }] });
    expect(ok).toBe(false);
  });
});
