import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerDepHandlers } from '../electron/ipc/depHandlers';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';

// Covers the W5 PR 12 extraction: registerDepHandlers wires the six dep:*
// channels (all ipcMain.handle) and preserves generate/sign/load/verify/export
// behavior verbatim. The two doctor helpers are injected as spies so the cross-
// domain wiring is proven: dep:generate delegates to runDoctorChecksInternal and
// dep:sign-and-save delegates to recordRemediationProvenance. fs effects are
// isolated to a temp dir; resolvers/dialog/window/doctor-helpers are faked.

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

let tmpDir: string, decisionsDir: string, govDir: string, evalsDir: string, snapshotsDir: string, provenancePath: string;
let runDoctorChecksInternal: any, recordRemediationProvenance: any;

function setup(opts: { dialog?: any; BrowserWindow?: any } = {}) {
  const ipc = makeFakeIpcMain();
  runDoctorChecksInternal = vi.fn(async () => ({ status: 'healthy', timestamp: 1, checks: [] }));
  recordRemediationProvenance = vi.fn(async () => {});
  registerDepHandlers({
    ipcMain: ipc as any,
    dialog: (opts.dialog ?? { showSaveDialog: async () => ({ canceled: true, filePath: undefined }) }) as any,
    BrowserWindow: (opts.BrowserWindow ?? { getFocusedWindow: () => null }) as any,
    getDecisionsDir: () => decisionsDir,
    getProvenancePath: () => provenancePath,
    getEvalsDir: () => evalsDir,
    getGovernanceDir: () => govDir,
    getSnapshotsDir: () => snapshotsDir,
    runDoctorChecksInternal,
    recordRemediationProvenance,
  });
  return { ipc };
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

// A sealed DEP object on disk under dep-<id>/dep.json. Includes the fields
// generateDEPMarkdown requires unguarded (decisionClass, evidenceSufficiency).
function writeDep(id: string, extra: any = {}) {
  const folder = path.join(decisionsDir, `dep-${id}`);
  fs.mkdirSync(folder, { recursive: true });
  const dep: any = {
    id, timestamp: extra.timestamp ?? '2026-05-01T00:00:00.000Z',
    releaseCandidateId: extra.releaseCandidateId ?? 'rc1',
    decisionClass: 'routine', evidenceSufficiency: 'pass', decisionSummary: 'Summary.',
    evidence: extra.evidence ?? [], signatures: extra.signatures ?? [{ authority: 'Board', hash: 'x' }],
    ...extra,
  };
  dep.hash = computeHash(dep);
  fs.writeFileSync(path.join(folder, 'dep.json'), JSON.stringify(dep, null, 2), 'utf-8');
  return dep;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-test-'));
  decisionsDir = path.join(tmpDir, 'decisions');
  govDir = path.join(tmpDir, 'governance');
  evalsDir = path.join(tmpDir, 'evals');
  snapshotsDir = path.join(tmpDir, 'snapshots');
  provenancePath = path.join(govDir, 'provenance.json');
});

afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('registerDepHandlers — registration', () => {
  it('registers exactly the six dep channels, all via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual([
      'dep:export-json', 'dep:export-markdown', 'dep:generate', 'dep:load-all', 'dep:sign-and-save', 'dep:verify',
    ]);
    for (const ch of ipc.channels()) expect(ipc.styleOf(ch)).toBe('handle');
  });
});

describe('dep:generate — delegates to injected runDoctorChecksInternal', () => {
  function seedCandidate() {
    fs.mkdirSync(govDir, { recursive: true });
    fs.writeFileSync(path.join(govDir, 'release_candidates.json'), JSON.stringify([
      { id: 'rc1', version: 'v1.0', status: 'approved', score: 0.9, baselineScore: 0.85, failuresCount: 0, benchmarkId: 'b1', timestamp: '2026-04-01T00:00:00.000Z' },
    ]), 'utf-8');
  }

  it('calls the doctor helper and returns a DEP (returned directly) for a known candidate', async () => {
    seedCandidate();
    const { ipc } = setup();
    const dep = await ipc.invoke('dep:generate', { rootPath: null, presetId: 'tm4', candidateId: 'rc1' });
    expect(runDoctorChecksInternal).toHaveBeenCalledWith(null, 'tm4');
    // dep:generate returns the DEP object directly (not wrapped in {success}).
    expect(dep.releaseCandidateId).toBe('rc1');
    expect(dep.schemaVersion).toBe('agentdeck.dep.v1');
    expect(dep.id).toMatch(/^DEP-\d{4}-/);
    // Deterministic: no runId + empty provenance ledger -> sufficiency 'fail'.
    expect(dep.evidenceSufficiency).toBe('fail');
    expect(dep.evidence.some((l: any) => l.layerId === 'risk-assessment')).toBe(true);
  });

  it('throws when the candidate is not found (invoke rejects)', async () => {
    fs.mkdirSync(govDir, { recursive: true });
    fs.writeFileSync(path.join(govDir, 'release_candidates.json'), JSON.stringify([]), 'utf-8');
    const { ipc } = setup();
    await expect(ipc.invoke('dep:generate', { rootPath: null, presetId: 'tm4', candidateId: 'missing' }))
      .rejects.toThrow(/not found/);
  });
});

describe('dep:sign-and-save — delegates to injected recordRemediationProvenance', () => {
  it('writes the dep folder and records remediation provenance', async () => {
    const { ipc } = setup();
    // A DEP shaped like dep:generate output (has the fields generateDEPMarkdown needs).
    const dep = {
      id: 'DEP-2026-ABCDE', releaseCandidateId: 'rc1', decisionType: 'approve',
      decisionClass: 'routine', evidenceSufficiency: 'pass', decisionSummary: 'Summary.',
      evidence: [], evidenceSnapshotHash: 'h', signatures: [],
    };
    const res = await ipc.invoke('dep:sign-and-save', {
      rootPath: null, presetId: 'tm4', dep, decisionRationale: 'ok', decisionClass: 'routine', overrideReason: undefined,
    });
    expect(res.success).toBe(true);
    expect(fs.existsSync(path.join(decisionsDir, 'dep-DEP-2026-ABCDE', 'dep.json'))).toBe(true);
    expect(fs.existsSync(path.join(decisionsDir, 'dep-DEP-2026-ABCDE', 'dep.md'))).toBe(true);
    expect(recordRemediationProvenance).toHaveBeenCalledTimes(1);
    expect(recordRemediationProvenance.mock.calls[0][0]).toBe(null);
    expect(recordRemediationProvenance.mock.calls[0][1]).toBe('tm4');
  });
});

describe('dep:load-all', () => {
  it('returns [] when the decisions dir is absent', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('dep:load-all', { rootPath: null, presetId: 'tm4' })).toEqual([]);
  });

  it('loads dep-*/dep.json, stamps integrityStatus, sorts descending by timestamp', async () => {
    writeDep('OLD', { timestamp: '2026-01-01T00:00:00.000Z' });
    writeDep('NEW', { timestamp: '2026-09-01T00:00:00.000Z' });
    const { ipc } = setup();
    const list = await ipc.invoke('dep:load-all', { rootPath: null, presetId: 'tm4' });
    expect(list.map((d: any) => d.id)).toEqual(['NEW', 'OLD']);
    expect(list.every((d: any) => d.integrityStatus === 'verified')).toBe(true);
  });
});

describe('dep:verify', () => {
  it('returns an error shape when the DEP file is missing', async () => {
    const { ipc } = setup();
    const res = await ipc.invoke('dep:verify', { rootPath: null, presetId: 'tm4', depId: 'missing' });
    expect(res).toEqual({ success: false, error: 'Evidence package record files missing.' });
  });

  it('reports hashValid + signatureValid + integrityStatus for a sealed, signed DEP', async () => {
    writeDep('SIGNED', { signatures: [{ authority: 'Board', hash: 'sig' }], evidence: [] });
    const { ipc } = setup();
    const res = await ipc.invoke('dep:verify', { rootPath: null, presetId: 'tm4', depId: 'SIGNED' });
    expect(res.success).toBe(true);
    expect(res.hashValid).toBe(true);
    expect(res.signatureValid).toBe(true);
    expect(res.integrityStatus).toBe('verified');
  });

  it('flags tampered when the stored hash no longer matches', async () => {
    const folder = path.join(decisionsDir, 'dep-TMP');
    fs.mkdirSync(folder, { recursive: true });
    const dep: any = { id: 'TMP', timestamp: '2026-01-01T00:00:00.000Z', evidence: [], signatures: [{ hash: 's' }] };
    dep.hash = computeHash(dep);
    dep.releaseCandidateId = 'mutated-after-hash';
    fs.writeFileSync(path.join(folder, 'dep.json'), JSON.stringify(dep), 'utf-8');
    const { ipc } = setup();
    const res = await ipc.invoke('dep:verify', { rootPath: null, presetId: 'tm4', depId: 'TMP' });
    expect(res.hashValid).toBe(false);
    expect(res.integrityStatus).toBe('tampered');
  });
});

describe('dep:export-json / dep:export-markdown', () => {
  it('export-json returns no-window error, then writes on a chosen path', async () => {
    writeDep('EXP');
    // No focused window.
    let { ipc } = setup({ BrowserWindow: { getFocusedWindow: () => null } });
    expect((await ipc.invoke('dep:export-json', { rootPath: null, presetId: 'tm4', depId: 'EXP' })).error)
      .toBe('No focused application window found.');

    // With a window + a chosen path.
    const out = path.join(tmpDir, 'out.json');
    ({ ipc } = setup({
      BrowserWindow: { getFocusedWindow: () => ({ id: 'w' }) },
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: out }) },
    }));
    const res = await ipc.invoke('dep:export-json', { rootPath: null, presetId: 'tm4', depId: 'EXP' });
    expect(res).toEqual({ success: true, filePath: out });
    expect(readJson(out).id).toBe('EXP');
    expect(readJson(out).exportedBy).toBe('Release Board Member');
  });

  it('export-markdown writes a dep.md and the chosen file via generateDEPMarkdown', async () => {
    writeDep('MD');
    const out = path.join(tmpDir, 'out.md');
    const { ipc } = setup({
      BrowserWindow: { getFocusedWindow: () => ({ id: 'w' }) },
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: out }) },
    });
    const res = await ipc.invoke('dep:export-markdown', { rootPath: null, presetId: 'tm4', depId: 'MD' });
    expect(res).toEqual({ success: true, filePath: out });
    const md = fs.readFileSync(out, 'utf-8');
    expect(md).toContain('# DECISION EVIDENCE PACKAGE: MD');
    // dep.md also written alongside dep.json.
    expect(fs.existsSync(path.join(decisionsDir, 'dep-MD', 'dep.md'))).toBe(true);
  });

  it('export returns cancelled when the dialog is dismissed', async () => {
    writeDep('CAN');
    const { ipc } = setup({
      BrowserWindow: { getFocusedWindow: () => ({ id: 'w' }) },
      dialog: { showSaveDialog: async () => ({ canceled: true, filePath: undefined }) },
    });
    expect((await ipc.invoke('dep:export-json', { rootPath: null, presetId: 'tm4', depId: 'CAN' })).error)
      .toBe('Export cancelled.');
  });
});
