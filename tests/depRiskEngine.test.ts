import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  computeRiskAssessment,
  computeEvidenceSufficiency,
  computeDeterministicHash,
  verifyIntegrityHash,
  signAndSaveDepPackage,
} from '../src/lib/depRiskEngine';

// Ported from scratch/test_decision_evidence_package.ts (audit W3).

describe('computeRiskAssessment', () => {
  it('scores 0 / LOW for a clean run (scratch Test 1)', () => {
    const result = computeRiskAssessment({
      failedCount: 0,
      doctorReport: { status: 'healthy', checks: [{ status: 'passed' }, { status: 'passed' }] },
      policyViolated: false,
      provenanceRecordCount: 1,
    });
    expect(result.riskPoints).toBe(0);
    expect(result.riskLevel).toBe('LOW');
  });

  it('scores 170 / CRITICAL for the compounded failure scenario (scratch Test 2)', () => {
    // 2 failed tests (40) + 1 warning (10) + 1 critical (50) + policy (30) + missing provenance (40) = 170
    const result = computeRiskAssessment({
      failedCount: 2,
      doctorReport: { status: 'critical', checks: [{ status: 'failed' }, { status: 'warning' }] },
      policyViolated: true,
      provenanceRecordCount: 0,
    });
    expect(result.riskPoints).toBe(170);
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.breakdown['Failed Test Cases (2)']).toBe(40);
    expect(result.breakdown['Doctor Warnings (1)']).toBe(10);
    expect(result.breakdown['Doctor Criticals (1)']).toBe(50);
    expect(result.breakdown['Policy Threshold Violations']).toBe(30);
    expect(result.breakdown['Missing Provenance Records Ledger']).toBe(40);
  });

  it.each([
    [0, 0, 'LOW'],
    [2, 40, 'MEDIUM'],
    [3, 60, 'HIGH'],
    [5, 100, 'CRITICAL'],
  ] as const)('failedCount=%d (%d points) classifies as %s', (failedCount, expectedPoints, level) => {
    const result = computeRiskAssessment({
      failedCount,
      doctorReport: { status: 'healthy', checks: [] },
      policyViolated: false,
      provenanceRecordCount: 1,
    });
    expect(result.riskPoints).toBe(expectedPoints);
    expect(result.riskLevel).toBe(level);
  });
});

describe('computeEvidenceSufficiency', () => {
  it('passes when a run is linked and provenance exists and doctor is not critical (scratch Test 1)', () => {
    const result = computeEvidenceSufficiency({ hasRunId: true, provenanceRecordCount: 1, doctorStatus: 'healthy' });
    expect(result.status).toBe('pass');
    expect(result.details).toEqual([]);
  });

  it('fails with all three reasons for the compounded scenario (scratch Test 2)', () => {
    const result = computeEvidenceSufficiency({ hasRunId: true, provenanceRecordCount: 0, doctorStatus: 'critical' });
    expect(result.status).toBe('fail');
    expect(result.details).toContain('Missing provenance causality trail.');
    expect(result.details).toContain('Workspace diagnostics reported critical vulnerabilities.');
  });

  it('flags a missing run link', () => {
    const result = computeEvidenceSufficiency({ hasRunId: false, provenanceRecordCount: 1, doctorStatus: 'healthy' });
    expect(result.status).toBe('fail');
    expect(result.details).toEqual(['Missing evaluations regression run link.']);
  });
});

describe('computeDeterministicHash / verifyIntegrityHash', () => {
  it('is deterministic regardless of key order', () => {
    expect(computeDeterministicHash({ a: 1, b: 2 })).toBe(computeDeterministicHash({ b: 2, a: 1 }));
  });

  it('verifies a matching hash and detects a mismatch after mutation', () => {
    const record: any = { id: 'x', value: 1 };
    record.hash = computeDeterministicHash(record);
    expect(verifyIntegrityHash(record)).toBe('verified');
    record.value = 2;
    expect(verifyIntegrityHash(record)).toBe('tampered');
  });

  it('reports unsigned when no hash is present', () => {
    expect(verifyIntegrityHash({ id: 'x' })).toBe('unsigned');
  });
});

describe('signAndSaveDepPackage — archive file-shape (scratch Test 3)', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-dep-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function buildFixtureDep() {
    return {
      schemaVersion: 'agentdeck.dep.v1',
      id: 'DEP-2026-RC001',
      releaseCandidateId: 'RC-001',
      decisionType: 'approve',
      finalDecision: 'approve',
      evidenceSnapshotHash: computeDeterministicHash({ seed: 1 }),
      evidence: [
        { layerId: 'doctor-report', title: 'Doctor', description: '', content: { status: 'critical' } },
        { layerId: 'provenance-chain', title: 'Provenance', description: '', content: { records: [] } },
        { layerId: 'snapshot-evidence', title: 'Snapshot', description: '', content: { snapshotId: 'snap-123' } },
        { layerId: 'eval-evidence', title: 'Evals', description: '', content: { runId: 'run-123' } },
      ],
      signatures: [] as any[],
    };
  }

  it('writes dep.json and all 4 evidence sub-files, and persists rationale/decisionClass/signatures', () => {
    const dep = buildFixtureDep();
    const { depFolder } = signAndSaveDepPackage(dep, 'Approved despite warnings because this is a diagnostic staging test.', 'critical', tempDir);

    expect(fs.existsSync(path.join(depFolder, 'dep.json'))).toBe(true);
    const evidenceFolder = path.join(depFolder, 'evidence');
    for (const f of ['doctor-report.json', 'provenance.json', 'snapshot.json', 'evaluations.json']) {
      expect(fs.existsSync(path.join(evidenceFolder, f))).toBe(true);
    }

    const loaded = JSON.parse(fs.readFileSync(path.join(depFolder, 'dep.json'), 'utf-8'));
    expect(loaded.decisionRationale).toBe('Approved despite warnings because this is a diagnostic staging test.');
    expect(loaded.decisionClass).toBe('critical');
    expect(loaded.signatures).toHaveLength(1);
    expect(loaded.integrityStatus).toBe('verified');
  });

  it('the persisted evidence sub-files match their source layer content', () => {
    const dep = buildFixtureDep();
    const { depFolder } = signAndSaveDepPackage(dep, 'rationale', 'routine', tempDir);
    const doctorRep = JSON.parse(fs.readFileSync(path.join(depFolder, 'evidence', 'doctor-report.json'), 'utf-8'));
    expect(doctorRep.status).toBe('critical');
    const snapshotEv = JSON.parse(fs.readFileSync(path.join(depFolder, 'evidence', 'snapshot.json'), 'utf-8'));
    expect(snapshotEv.snapshotId).toBe('snap-123');
  });
});
