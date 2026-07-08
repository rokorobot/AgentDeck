import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * CHARACTERIZATION MODULE (audit W3 — ported from scratch/test_decision_evidence_package.ts).
 *
 * Mirrors the Decision Evidence Package (DEP) risk-scoring, evidence-
 * sufficiency, and sign/save archive logic currently inline inside
 * electron/main.ts's `dep:generate` and `dep:sign-and-save` IPC handlers.
 * This is a faithful extraction of the COMPUTATION, not a replacement for
 * those handlers -- main.ts still carries its own inline copy and is the
 * actual code path exercised by the running app today. These functions are
 * tested here as a specification of intended behavior; they are NOT wired
 * into electron/main.ts (that wiring is W5/main.ts-decomposition scope).
 *
 * Integrity note (audit QW2): computeDeterministicHash/verifyIntegrityHash
 * are an unkeyed SHA-256 checksum, not a cryptographic signature -- they
 * detect accidental corruption, not a determined tamperer who recomputes
 * the hash. Naming and comments here intentionally avoid "seal"/"signature"
 * language for the same reason main.ts's UI-facing strings were corrected.
 */

export interface DoctorCheckLike {
  status: string;
}

export interface DoctorReportLike {
  status: string;
  checks: DoctorCheckLike[];
}

export interface RiskAssessmentInput {
  failedCount: number;
  doctorReport: DoctorReportLike;
  policyViolated: boolean;
  provenanceRecordCount: number;
}

export interface RiskAssessment {
  riskPoints: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  breakdown: Record<string, number>;
}

/** Deterministic risk-scoring formula (mirrors main.ts dep:generate). */
export function computeRiskAssessment(input: RiskAssessmentInput): RiskAssessment {
  let riskPoints = 0;
  const breakdown: Record<string, number> = {};

  if (input.failedCount > 0) {
    const p = input.failedCount * 20;
    riskPoints += p;
    breakdown[`Failed Test Cases (${input.failedCount})`] = p;
  }

  const doctorWarnings = input.doctorReport.checks.filter((c) => c.status === 'warning').length;
  if (doctorWarnings > 0) {
    const p = doctorWarnings * 10;
    riskPoints += p;
    breakdown[`Doctor Warnings (${doctorWarnings})`] = p;
  }

  const doctorCriticals = input.doctorReport.checks.filter((c) => c.status === 'failed').length;
  if (doctorCriticals > 0) {
    const p = doctorCriticals * 50;
    riskPoints += p;
    breakdown[`Doctor Criticals (${doctorCriticals})`] = p;
  }

  if (input.policyViolated) {
    riskPoints += 30;
    breakdown['Policy Threshold Violations'] = 30;
  }

  if (input.provenanceRecordCount === 0) {
    riskPoints += 40;
    breakdown['Missing Provenance Records Ledger'] = 40;
  }

  let riskLevel: RiskAssessment['riskLevel'] = 'LOW';
  if (riskPoints > 80) riskLevel = 'CRITICAL';
  else if (riskPoints > 50) riskLevel = 'HIGH';
  else if (riskPoints > 20) riskLevel = 'MEDIUM';

  return { riskPoints, riskLevel, breakdown };
}

export interface EvidenceSufficiencyInput {
  hasRunId: boolean;
  provenanceRecordCount: number;
  doctorStatus: string;
}

export interface EvidenceSufficiency {
  status: 'pass' | 'fail';
  details: string[];
}

/** Evidence-sufficiency rules (mirrors main.ts dep:generate). */
export function computeEvidenceSufficiency(input: EvidenceSufficiencyInput): EvidenceSufficiency {
  const details: string[] = [];
  if (!input.hasRunId) details.push('Missing evaluations regression run link.');
  if (input.provenanceRecordCount === 0) details.push('Missing provenance causality trail.');
  if (input.doctorStatus === 'critical') details.push('Workspace diagnostics reported critical vulnerabilities.');
  return { status: details.length === 0 ? 'pass' : 'fail', details };
}

/**
 * Deterministic SHA-256 integrity checksum (mirrors main.ts computeHash).
 * NOT a cryptographic signature -- see audit QW2.
 */
export function computeDeterministicHash(obj: any): string {
  if (obj === null || obj === undefined) return '';
  const sortObject = (o: any): any => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sortObject);
    return Object.keys(o).sort().reduce((acc: any, key: string) => {
      if (key === 'hash' || key === 'integrityStatus' || key === 'tampered') return acc;
      acc[key] = sortObject(o[key]);
      return acc;
    }, {});
  };
  return crypto.createHash('sha256').update(JSON.stringify(sortObject(obj))).digest('hex');
}

/** Verifies whether a stored checksum still matches its recomputed value. */
export function verifyIntegrityHash(obj: any): 'verified' | 'unsigned' | 'tampered' {
  if (!obj || typeof obj !== 'object') return 'unsigned';
  const hash = obj.hash || (obj.manifest && obj.manifest.hash);
  if (!hash) return 'unsigned';
  return hash === computeDeterministicHash(obj) ? 'verified' : 'tampered';
}

export interface DepSignoff {
  authority: string;
  timestamp: string;
  hash: string;
}

/**
 * Signs off a DEP object (appends a board sign-off + package checksum) and
 * writes the archive shape mirrored from main.ts's dep:sign-and-save handler:
 *   <decisionsDir>/dep-<id>/dep.json
 *   <decisionsDir>/dep-<id>/evidence/{doctor-report,provenance,snapshot,evaluations}.json
 * Mutates and returns `dep`, plus the folder it was written to.
 */
export function signAndSaveDepPackage(
  dep: any,
  rationale: string,
  decisionClass: string,
  decisionsDir: string
): { dep: any; depFolder: string } {
  dep.decisionRationale = rationale;
  dep.decisionClass = decisionClass;
  dep.approvedBy = 'Release Board';
  dep.approvedAt = new Date().toISOString();

  const sigTimestamp = new Date().toISOString();
  const sigPayload = {
    authority: 'Release Board',
    rationale,
    timestamp: sigTimestamp,
    evidenceHash: dep.evidenceSnapshotHash,
  };
  const sigHash = computeDeterministicHash(sigPayload);
  const signoff: DepSignoff = { authority: 'Release Board', timestamp: sigTimestamp, hash: sigHash };
  dep.signatures = [signoff];

  const sigLayer = dep.evidence.find((l: any) => l.layerId === 'signatures') || {
    layerId: 'signatures',
    title: 'Authorized Decision Board Sign-offs',
    description: 'Integrity checksums (unkeyed SHA-256) appended by authorized stakeholders.',
    content: {},
  };
  sigLayer.content.signatures = [signoff];
  if (!dep.evidence.some((l: any) => l.layerId === 'signatures')) {
    dep.evidence.push(sigLayer);
  }

  dep.hash = computeDeterministicHash(dep);
  dep.integrityStatus = 'verified';

  const depFolder = path.join(decisionsDir, `dep-${dep.id}`);
  const evidenceFolder = path.join(depFolder, 'evidence');
  fs.mkdirSync(evidenceFolder, { recursive: true });

  fs.writeFileSync(path.join(depFolder, 'dep.json'), JSON.stringify(dep, null, 2), 'utf-8');

  const docRep = dep.evidence.find((l: any) => l.layerId === 'doctor-report')?.content || {};
  const prov = dep.evidence.find((l: any) => l.layerId === 'provenance-chain')?.content || {};
  const snap = dep.evidence.find((l: any) => l.layerId === 'snapshot-evidence')?.content || {};
  const evals = dep.evidence.find((l: any) => l.layerId === 'eval-evidence')?.content || {};

  fs.writeFileSync(path.join(evidenceFolder, 'doctor-report.json'), JSON.stringify(docRep, null, 2), 'utf-8');
  fs.writeFileSync(path.join(evidenceFolder, 'provenance.json'), JSON.stringify(prov, null, 2), 'utf-8');
  fs.writeFileSync(path.join(evidenceFolder, 'snapshot.json'), JSON.stringify(snap, null, 2), 'utf-8');
  fs.writeFileSync(path.join(evidenceFolder, 'evaluations.json'), JSON.stringify(evals, null, 2), 'utf-8');

  return { dep, depFolder };
}
