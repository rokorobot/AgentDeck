import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerDoctorHandlers } from '../electron/ipc/doctorHandlers';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';

// Covers the W5 PR 11 extraction: registerDoctorHandlers wires the three
// doctor:* channels (all ipcMain.handle) and preserves runDoctorChecksInternal
// verbatim -- exact 8-check inventory + IDs, overall-status logic, repair paths
// (incl. governance quarantine + remediation-provenance recording), and export-
// bundle behavior. It also RETURNS runDoctorChecksInternal + recordRemediation-
// Provenance so main.ts's still-inline DEP handlers keep calling them. This PR
// does NOT adopt src/lib/workspaceDoctor.ts -- inline behavior is preserved.
// fs effects isolated to a temp dir; resolvers/dialog/window faked.

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

let tmpDir: string, rootPath: string, dataDir: string;
let govDir: string, evalsDir: string, timelineDir: string, snapshotsDir: string, provenancePath: string;

function setup(opts: { dialog?: any; BrowserWindow?: any } = {}) {
  const ipc = makeFakeIpcMain();
  const api = registerDoctorHandlers({
    ipcMain: ipc as any,
    dialog: (opts.dialog ?? { showSaveDialog: async () => ({ canceled: true, filePath: undefined }) }) as any,
    BrowserWindow: (opts.BrowserWindow ?? { getFocusedWindow: () => null }) as any,
    getEvalsDir: () => evalsDir,
    getTimelineDir: () => timelineDir,
    getGovernanceDir: () => govDir,
    getProvenancePath: () => provenancePath,
    getSnapshotsDir: () => snapshotsDir,
    dataDir,
  });
  return { ipc, ...api };
}

const EXPECTED_CHECK_IDS = [
  'folders-exist', 'governance-schema', 'snapshots-integrity', 'provenance-tamper',
  'provenance-chronology', 'rc-references', 'gold-standard-orphans', 'empty-malformed-files',
];

function makeHealthyWorkspace() {
  // Non-preset rootPath whose .agentdeck subtree exists; resolvers point into it.
  fs.mkdirSync(path.join(rootPath, '.agentdeck', 'evals'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, '.agentdeck', 'timeline'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, '.agentdeck', 'governance'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, '.agentdeck', 'snapshots'), { recursive: true });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-test-'));
  rootPath = path.join(tmpDir, 'ws');
  dataDir = path.join(tmpDir, 'data');
  govDir = path.join(rootPath, '.agentdeck', 'governance');
  evalsDir = path.join(rootPath, '.agentdeck', 'evals');
  timelineDir = path.join(rootPath, '.agentdeck', 'timeline');
  snapshotsDir = path.join(rootPath, '.agentdeck', 'snapshots');
  provenancePath = path.join(govDir, 'provenance.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('registerDoctorHandlers — registration + returned helpers', () => {
  it('registers exactly the three doctor channels, all via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual(['doctor:export-diagnostic-bundle', 'doctor:repair', 'doctor:run-checks']);
    for (const ch of ['doctor:export-diagnostic-bundle', 'doctor:repair', 'doctor:run-checks']) {
      expect(ipc.styleOf(ch)).toBe('handle');
    }
  });

  it('returns runDoctorChecksInternal + recordRemediationProvenance for DEP reuse', () => {
    const api = setup();
    expect(typeof api.runDoctorChecksInternal).toBe('function');
    expect(typeof api.recordRemediationProvenance).toBe('function');
  });
});

describe('runDoctorChecksInternal — check inventory + status', () => {
  it('produces exactly the 8 checks in order and reports healthy for a clean workspace', async () => {
    makeHealthyWorkspace();
    const { runDoctorChecksInternal } = setup();
    const report = await runDoctorChecksInternal(rootPath, 'custom');
    expect(report.checks.map((c: any) => c.id)).toEqual(EXPECTED_CHECK_IDS);
    expect(report.checks.every((c: any) => c.status === 'passed')).toBe(true);
    expect(report.status).toBe('healthy');
    expect(typeof report.timestamp).toBe('number');
  });

  it('fails folders-exist (critical) when rootPath is missing for a non-preset', async () => {
    const { runDoctorChecksInternal } = setup();
    const report = await runDoctorChecksInternal(null, 'custom');
    const folders = report.checks.find((c: any) => c.id === 'folders-exist');
    expect(folders.status).toBe('failed');
    expect(folders.details.missingDirs).toContain('rootPath');
    expect(report.status).toBe('critical');
  });

  it('fails governance-schema with repairType remediate when a candidate is tampered', async () => {
    makeHealthyWorkspace();
    const rc: any = { id: 'rc1', schemaVersion: 'agentdeck.governance.v1', score: 0.9 };
    rc.hash = computeHash(rc);
    rc.score = 0.1; // mutate after hashing -> tampered
    fs.writeFileSync(path.join(govDir, 'release_candidates.json'), JSON.stringify([rc]), 'utf-8');

    const { runDoctorChecksInternal } = setup();
    const report = await runDoctorChecksInternal(rootPath, 'custom');
    const gov = report.checks.find((c: any) => c.id === 'governance-schema');
    expect(gov.status).toBe('failed');
    expect(gov.repairType).toBe('remediate');
    expect(report.status).toBe('critical');
  });
});

describe('doctor:run-checks', () => {
  it('delegates to runDoctorChecksInternal and returns the same shape', async () => {
    makeHealthyWorkspace();
    const { ipc, runDoctorChecksInternal } = setup();
    const viaChannel = await ipc.invoke('doctor:run-checks', { rootPath, presetId: 'custom' });
    const direct = await runDoctorChecksInternal(rootPath, 'custom');
    expect(viaChannel.status).toBe(direct.status);
    expect(viaChannel.checks.map((c: any) => c.id)).toEqual(direct.checks.map((c: any) => c.id));
  });
});

describe('doctor:repair', () => {
  it('folders-exist recreates the missing .agentdeck subdirectories', async () => {
    fs.mkdirSync(rootPath, { recursive: true }); // rootPath exists but no .agentdeck
    const { ipc } = setup();
    const res = await ipc.invoke('doctor:repair', { rootPath, presetId: 'custom', checkId: 'folders-exist' });
    expect(res).toEqual({ success: true });
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      expect(fs.existsSync(path.join(rootPath, '.agentdeck', sub))).toBe(true);
    }
  });

  it('governance-schema backs up, reseeds compliant policies, and quarantines a tampered candidate', async () => {
    makeHealthyWorkspace();
    // Existing (bad) policies + a tampered candidate.
    fs.writeFileSync(path.join(govDir, 'policies.json'), JSON.stringify({ schemaVersion: 'wrong' }), 'utf-8');
    const rc: any = { id: 'rcX', schemaVersion: 'agentdeck.governance.v1', score: 0.9 };
    rc.hash = computeHash(rc);
    rc.score = 0.2; // tamper
    fs.writeFileSync(path.join(govDir, 'release_candidates.json'), JSON.stringify([rc]), 'utf-8');

    const { ipc } = setup();
    const res = await ipc.invoke('doctor:repair', { rootPath, presetId: 'custom', checkId: 'governance-schema' });
    expect(res).toEqual({ success: true });

    // Policies reseeded to a compliant, self-verifying default (backup kept).
    const policies = JSON.parse(fs.readFileSync(path.join(govDir, 'policies.json'), 'utf-8'));
    expect(policies.schemaVersion).toBe('agentdeck.governance.v1');
    expect(verifyHash(policies)).toBe('verified');
    expect(fs.readdirSync(govDir).some((f) => f.includes('policies.json.bak-'))).toBe(true);
    // Tampered candidate quarantined (.compromised) and removed from the list.
    expect(fs.existsSync(path.join(govDir, 'candidate-rcX.json.compromised'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(govDir, 'release_candidates.json'), 'utf-8'))).toEqual([]);
    // A remediation record was appended to provenance.
    const prov = JSON.parse(fs.readFileSync(provenancePath, 'utf-8'));
    expect(prov.records[0].mutationType).toBe('release_candidate_updated');
    expect(verifyHash(prov.records[0])).toBe('verified');
  });
});

describe('recordRemediationProvenance (returned helper)', () => {
  it('appends a hashed, verified record to the provenance ledger (newest first)', async () => {
    fs.mkdirSync(govDir, { recursive: true });
    const { recordRemediationProvenance } = setup();
    await recordRemediationProvenance(rootPath, 'custom', { id: 'r1', mutationType: 'x' });
    await recordRemediationProvenance(rootPath, 'custom', { id: 'r2', mutationType: 'y' });
    const prov = JSON.parse(fs.readFileSync(provenancePath, 'utf-8'));
    expect(prov.records.map((r: any) => r.id)).toEqual(['r2', 'r1']);
    expect(prov.records.every((r: any) => r.integrityStatus === 'verified' && verifyHash(r) === 'verified')).toBe(true);
  });
});

describe('doctor:export-diagnostic-bundle', () => {
  it('returns an error when no focused window exists', async () => {
    makeHealthyWorkspace();
    const { ipc } = setup({ BrowserWindow: { getFocusedWindow: () => null } });
    const res = await ipc.invoke('doctor:export-diagnostic-bundle', { rootPath, presetId: 'custom' });
    expect(res).toEqual({ success: false, error: 'No focused application window found.' });
  });

  it('returns cancelled when the save dialog is dismissed', async () => {
    makeHealthyWorkspace();
    const { ipc } = setup({
      BrowserWindow: { getFocusedWindow: () => ({ id: 'w' }) },
      dialog: { showSaveDialog: async () => ({ canceled: true, filePath: undefined }) },
    });
    const res = await ipc.invoke('doctor:export-diagnostic-bundle', { rootPath, presetId: 'custom' });
    expect(res).toEqual({ success: false, error: 'Export cancelled by user.' });
  });

  it('writes a diagnostics bundle (doctorReport + payload) to the chosen path', async () => {
    makeHealthyWorkspace();
    const outPath = path.join(tmpDir, 'bundle.json');
    const { ipc } = setup({
      BrowserWindow: { getFocusedWindow: () => ({ id: 'w' }) },
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: outPath }) },
    });
    const res = await ipc.invoke('doctor:export-diagnostic-bundle', { rootPath, presetId: 'custom' });
    expect(res).toEqual({ success: true, filePath: outPath });
    const bundle = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(bundle.schemaVersion).toBe('agentdeck.diagnostics.v1');
    expect(bundle.doctorReport.checks.map((c: any) => c.id)).toEqual(EXPECTED_CHECK_IDS);
    expect(bundle.payload).toHaveProperty('snapshotsList');
    // 2-space formatting preserved.
    expect(fs.readFileSync(outPath, 'utf-8')).toBe(JSON.stringify(bundle, null, 2));
  });
});
