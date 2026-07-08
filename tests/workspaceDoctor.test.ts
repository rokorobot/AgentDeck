import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  runWorkspaceDoctorChecks,
  repairWorkspaceDoctorCheck,
} from '../src/lib/workspaceDoctor';
import { computeDeterministicHash } from '../src/lib/depRiskEngine';

// Ported from scratch/test_workspace_doctor.ts (audit W3).

let workspaceRoot: string;
let baseDir: string;

function checkOf(report: ReturnType<typeof runWorkspaceDoctorChecks>, id: string) {
  return report.checks.find((c) => c.id === id)!;
}

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-doctor-'));
  baseDir = path.join(workspaceRoot, '.agentdeck');
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('runWorkspaceDoctorChecks — check coverage', () => {
  it('reports all 7 checks failed/passed appropriately on a missing .agentdeck', () => {
    const report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(report.status).toBe('critical');
    expect(checkOf(report, 'folders-exist').status).toBe('failed');
  });

  it('reports healthy on a freshly-initialized empty workspace', () => {
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      fs.mkdirSync(path.join(baseDir, sub), { recursive: true });
    }
    const report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(report.status).toBe('healthy');
    expect(report.checks).toHaveLength(7);
  });

  it('flags an invalid governance schema version', () => {
    fs.mkdirSync(path.join(baseDir, 'governance'), { recursive: true });
    fs.writeFileSync(path.join(baseDir, 'governance', 'policies.json'), JSON.stringify({ schemaVersion: 'bogus' }));
    const report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'governance-schema').status).toBe('failed');
  });

  it('flags gold standards that reference a missing benchmark as a warning', () => {
    const evalsDir = path.join(baseDir, 'evals');
    fs.mkdirSync(path.join(evalsDir, 'gold-standards'), { recursive: true });
    fs.writeFileSync(path.join(evalsDir, 'benchmarks.json'), JSON.stringify([{ id: 'b-1' }]));
    fs.writeFileSync(path.join(evalsDir, 'gold-standards', 'gold-1.json'), JSON.stringify({ id: 'gold-1', benchmarkId: 'ghost' }));
    const report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'gold-standard-orphans').status).toBe('warning');
  });

  it('flags a malformed eval file', () => {
    const evalsDir = path.join(baseDir, 'evals');
    fs.mkdirSync(evalsDir, { recursive: true });
    fs.writeFileSync(path.join(evalsDir, 'benchmarks.json'), '{ not valid json');
    const report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'empty-malformed-files').status).toBe('failed');
  });

  it('flags out-of-order provenance chronology', () => {
    const govDir = path.join(baseDir, 'governance');
    fs.mkdirSync(govDir, { recursive: true });
    fs.writeFileSync(path.join(govDir, 'provenance.json'), JSON.stringify({
      records: [
        { id: 'a', timestamp: 100, sourceType: 'policy', mutationType: 'x', before: {}, after: {} },
        { id: 'b', timestamp: 200, sourceType: 'policy', mutationType: 'x', before: {}, after: {} },
      ],
    }));
    const report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'provenance-chronology').status).toBe('failed');
  });
});

describe('runWorkspaceDoctorChecks / repairWorkspaceDoctorCheck — scratch Test A: folders missing & repair', () => {
  it('repairs the folders-exist check by recreating subdirectories', () => {
    let report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'folders-exist').status).toBe('failed');

    repairWorkspaceDoctorCheck(workspaceRoot, 'folders-exist');
    report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'folders-exist').status).toBe('passed');
  });
});

describe('repairWorkspaceDoctorCheck — scratch Test B: unsigned snapshot seal', () => {
  it('computes and writes a checksum for an unsigned snapshot manifest', () => {
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      fs.mkdirSync(path.join(baseDir, sub), { recursive: true });
    }
    const snapPath = path.join(baseDir, 'snapshots', 'snapshot-test.json');
    fs.writeFileSync(snapPath, JSON.stringify({
      manifest: { schemaVersion: 'agentdeck.snapshot.v1', snapshotId: 'test-snap', description: 'unsigned test' },
      payload: {},
    }));

    let report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'snapshots-integrity').status).toBe('warning');

    repairWorkspaceDoctorCheck(workspaceRoot, 'snapshots-integrity');

    const sealed = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    expect(sealed.manifest.hash).toBeTruthy();

    report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'snapshots-integrity').status).toBe('passed');
  });
});

describe('repairWorkspaceDoctorCheck — scratch Test C: tampered snapshot quarantine', () => {
  it('quarantines a tampered snapshot to .compromised and writes a provenance remediation record', () => {
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      fs.mkdirSync(path.join(baseDir, sub), { recursive: true });
    }
    fs.writeFileSync(path.join(baseDir, 'governance', 'provenance.json'), JSON.stringify({ records: [] }));

    const snapPath = path.join(baseDir, 'snapshots', 'snapshot-test.json');
    const snap: any = { manifest: { schemaVersion: 'agentdeck.snapshot.v1', snapshotId: 'test-snap' }, payload: {} };
    snap.manifest.hash = computeDeterministicHash(snap);
    fs.writeFileSync(snapPath, JSON.stringify(snap));

    // Tamper the payload after sealing -- the stored hash no longer matches.
    snap.payload = { modifiedData: 'corrupted state' };
    fs.writeFileSync(snapPath, JSON.stringify(snap));

    let report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'snapshots-integrity').status).toBe('failed');

    repairWorkspaceDoctorCheck(workspaceRoot, 'snapshots-integrity');

    expect(fs.existsSync(`${snapPath}.compromised`)).toBe(true);
    expect(fs.existsSync(snapPath)).toBe(false);

    report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'snapshots-integrity').status).toBe('passed');

    const provenance = JSON.parse(fs.readFileSync(path.join(baseDir, 'governance', 'provenance.json'), 'utf-8'));
    expect(provenance.records).toHaveLength(1);
    expect(provenance.records[0].mutationType).toBe('snapshot_restored');
    expect(provenance.records[0].after.status).toBe('quarantined');
  });
});

describe('repairWorkspaceDoctorCheck — scratch Test D: tampered provenance quarantine & re-seed', () => {
  it('quarantines the whole ledger to .compromised and re-seeds a clean, checksummed ledger', () => {
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      fs.mkdirSync(path.join(baseDir, sub), { recursive: true });
    }
    const provPath = path.join(baseDir, 'governance', 'provenance.json');
    const record: any = { id: 'rec-1', sourceType: 'policy', mutationType: 'x', before: {}, after: { message: 'original' }, timestamp: 1 };
    record.hash = computeDeterministicHash(record);
    fs.writeFileSync(provPath, JSON.stringify({ records: [record] }));

    // Tamper the record in place -- the stored hash no longer matches.
    const data = JSON.parse(fs.readFileSync(provPath, 'utf-8'));
    data.records[0].after.message = 'compromised modification';
    fs.writeFileSync(provPath, JSON.stringify(data));

    let report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'provenance-tamper').status).toBe('failed');

    repairWorkspaceDoctorCheck(workspaceRoot, 'provenance-tamper');

    expect(fs.existsSync(`${provPath}.compromised`)).toBe(true);

    report = runWorkspaceDoctorChecks(workspaceRoot);
    expect(checkOf(report, 'provenance-tamper').status).toBe('passed');

    const reseeded = JSON.parse(fs.readFileSync(provPath, 'utf-8'));
    expect(reseeded.records).toHaveLength(1);
    expect(reseeded.records[0].mutationType).toBe('policy_updated');
    expect(reseeded.records[0].after.status).toBe('reinitialized_clean');
  });

  it('seals unsigned (non-tampered) provenance records in place, without quarantine', () => {
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      fs.mkdirSync(path.join(baseDir, sub), { recursive: true });
    }
    const provPath = path.join(baseDir, 'governance', 'provenance.json');
    fs.writeFileSync(provPath, JSON.stringify({
      records: [{ id: 'rec-1', sourceType: 'policy', mutationType: 'x', before: {}, after: {}, timestamp: 1 }],
    }));

    repairWorkspaceDoctorCheck(workspaceRoot, 'provenance-tamper');

    expect(fs.existsSync(`${provPath}.compromised`)).toBe(false);
    const sealed = JSON.parse(fs.readFileSync(provPath, 'utf-8'));
    expect(sealed.records[0].hash).toBeTruthy();
  });
});
