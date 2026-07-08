import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { computeDeterministicHash, verifyIntegrityHash } from './depRiskEngine';

/**
 * CHARACTERIZATION MODULE (audit W3 — ported from scratch/test_workspace_doctor.ts).
 *
 * Mirrors the Workspace Doctor diagnostic checks and repair/quarantine logic
 * currently inline inside electron/main.ts's `runDoctorChecksInternal` and
 * `doctor:repair` IPC handler. This covers the 7 checks the original scratch
 * script exercised; main.ts's current handler also has an 8th check
 * ('rc-references', release-candidate <-> timeline/run linkage) added since
 * that script was written, which is intentionally out of scope here (W3 is
 * porting existing scratch coverage, not expanding it).
 *
 * This is a faithful extraction of the COMPUTATION, not a replacement for
 * main.ts's handlers -- main.ts still carries its own inline copy and is the
 * actual code path exercised by the running app today. These functions are
 * tested here as a specification of intended behavior; they are NOT wired
 * into electron/main.ts (that wiring is W5/main.ts-decomposition scope).
 *
 * Message wording intentionally uses the post-QW2 "checksum"/"integrity"
 * phrasing (not the pre-QW2 "signature"/"seal" wording the original scratch
 * script had) to characterize CURRENT main.ts behavior honestly.
 */

export type CheckStatus = 'passed' | 'warning' | 'failed';

export interface DoctorCheck {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  repairable: boolean;
}

export interface DoctorReport {
  status: 'healthy' | 'warning' | 'critical';
  checks: DoctorCheck[];
}

/** Runs the 7 ported workspace-doctor diagnostic checks against a real workspace root. */
export function runWorkspaceDoctorChecks(rootPath: string): DoctorReport {
  const checks: DoctorCheck[] = [];
  const baseDir = path.join(rootPath, '.agentdeck');
  const baseExists = fs.existsSync(baseDir);

  // 1. Folders exist
  const missingDirs: string[] = [];
  if (!baseExists) {
    missingDirs.push('.agentdeck');
  } else {
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      if (!fs.existsSync(path.join(baseDir, sub))) missingDirs.push(`.agentdeck/${sub}`);
    }
  }
  checks.push({
    id: 'folders-exist',
    name: 'Workspace Directories Existence',
    status: missingDirs.length > 0 ? 'failed' : 'passed',
    message: missingDirs.length > 0 ? `Missing folders: ${missingDirs.join(', ')}` : 'All workspace subdirectories exist.',
    repairable: true,
  });

  // 2. Governance schema
  const govDir = path.join(baseDir, 'governance');
  const policiesPath = path.join(govDir, 'policies.json');
  const candidatesPath = path.join(govDir, 'release_candidates.json');
  let govStatus: CheckStatus = 'passed';
  let govMessage = 'Governance files are schema compliant.';
  let candidatesList: any[] = [];

  if (fs.existsSync(policiesPath)) {
    try {
      const policies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));
      if (policies.schemaVersion !== 'agentdeck.governance.v1') {
        govStatus = 'failed';
        govMessage = `policies.json has invalid schema version: ${policies.schemaVersion || 'none'}`;
      }
    } catch {
      govStatus = 'failed';
      govMessage = 'Malformed policies.json';
    }
  }
  if (fs.existsSync(candidatesPath) && govStatus === 'passed') {
    try {
      candidatesList = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
      for (const rc of candidatesList) {
        if (rc.schemaVersion !== 'agentdeck.governance.v1') {
          govStatus = 'failed';
          govMessage = `Release candidate ${rc.id || 'unknown'} has invalid schema version: ${rc.schemaVersion || 'none'}`;
          break;
        }
        if (verifyIntegrityHash(rc) === 'tampered') {
          govStatus = 'failed';
          govMessage = `Release candidate ${rc.id || 'unknown'} has a checksum mismatch.`;
          break;
        }
      }
    } catch {
      govStatus = 'failed';
      govMessage = 'Malformed release_candidates.json';
    }
  }
  checks.push({ id: 'governance-schema', name: 'Governance Schema and Schema Version Validity', status: govStatus, message: govMessage, repairable: true });

  // 3. Snapshots integrity
  const snapshotsDir = path.join(baseDir, 'snapshots');
  const tamperedSnaps: string[] = [];
  const unsignedSnaps: string[] = [];
  if (fs.existsSync(snapshotsDir)) {
    for (const file of fs.readdirSync(snapshotsDir)) {
      if (file.endsWith('.json') && !file.startsWith('temp_') && !file.includes('.compromised') && !file.includes('.bak')) {
        try {
          const snap = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
          if (snap.manifest) {
            const integrity = verifyIntegrityHash(snap);
            if (integrity === 'tampered') tamperedSnaps.push(snap.manifest.snapshotId || file);
            else if (integrity === 'unsigned') unsignedSnaps.push(snap.manifest.snapshotId || file);
          }
        } catch {
          tamperedSnaps.push(file);
        }
      }
    }
  }
  let snapStatus: CheckStatus = 'passed';
  let snapMessage = 'All snapshots are verified and intact.';
  if (tamperedSnaps.length > 0) {
    snapStatus = 'failed';
    snapMessage = `Snapshots with a checksum mismatch: ${tamperedSnaps.join(', ')}`;
  } else if (unsignedSnaps.length > 0) {
    snapStatus = 'warning';
    snapMessage = `Snapshots with no integrity checksum: ${unsignedSnaps.join(', ')}`;
  }
  checks.push({ id: 'snapshots-integrity', name: 'Snapshot Manifest Verification', status: snapStatus, message: snapMessage, repairable: true });

  // 4. Provenance tamper
  const provenancePath = path.join(govDir, 'provenance.json');
  let provenanceData: { records: any[] } = { records: [] };
  const tamperedProvIds: string[] = [];
  const unsignedProvIds: string[] = [];
  let provStatus: CheckStatus = 'passed';
  let provMessage = 'Provenance ledger is verified and intact.';
  if (fs.existsSync(provenancePath)) {
    try {
      provenanceData = JSON.parse(fs.readFileSync(provenancePath, 'utf-8'));
      if (Array.isArray(provenanceData.records)) {
        for (const rec of provenanceData.records) {
          const integrity = verifyIntegrityHash(rec);
          if (integrity === 'tampered') tamperedProvIds.push(rec.id || 'unknown');
          else if (integrity === 'unsigned') unsignedProvIds.push(rec.id || 'unknown');
        }
      }
    } catch {
      provStatus = 'failed';
      provMessage = 'Malformed provenance.json';
    }
  }
  if (provStatus === 'passed') {
    if (tamperedProvIds.length > 0) {
      provStatus = 'failed';
      provMessage = `Provenance records with a checksum mismatch: ${tamperedProvIds.join(', ')}`;
    } else if (unsignedProvIds.length > 0) {
      provStatus = 'warning';
      provMessage = `Provenance records with no integrity checksum: ${unsignedProvIds.join(', ')}`;
    }
  }
  checks.push({ id: 'provenance-tamper', name: 'Provenance Integrity Checksums', status: provStatus, message: provMessage, repairable: true });

  // 5. Provenance chronology
  let chronoStatus: CheckStatus = 'passed';
  let chronoMessage = 'Provenance chronology and details are valid.';
  if (provStatus !== 'failed' && fs.existsSync(provenancePath)) {
    const records = provenanceData.records;
    const seenIds = new Set<string>();
    let ordered = true;
    const duplicateIds: string[] = [];
    const schemaIncompleteIds: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.id) {
        if (seenIds.has(rec.id)) duplicateIds.push(rec.id);
        seenIds.add(rec.id);
      } else {
        duplicateIds.push(`index-${i}`);
      }
      if (!rec.sourceType || !rec.mutationType || rec.before === undefined || rec.after === undefined) {
        schemaIncompleteIds.push(rec.id || `index-${i}`);
      }
      if (i > 0 && records[i - 1].timestamp < rec.timestamp) {
        ordered = false;
      }
    }

    if (duplicateIds.length > 0 || schemaIncompleteIds.length > 0 || !ordered) {
      const issues: string[] = [];
      if (duplicateIds.length > 0) issues.push(`Duplicate IDs: ${duplicateIds.join(', ')}`);
      if (schemaIncompleteIds.length > 0) issues.push(`Incomplete schemas: ${schemaIncompleteIds.join(', ')}`);
      if (!ordered) issues.push('Chronological ordering is incorrect');
      chronoStatus = 'failed';
      chronoMessage = issues.join('; ');
    }
  }
  checks.push({ id: 'provenance-chronology', name: 'Provenance Chronological Ordering and Metadata Checks', status: chronoStatus, message: chronoMessage, repairable: true });

  // 6. Gold standard orphans
  const evalsDir = path.join(baseDir, 'evals');
  const goldStandardsDir = path.join(evalsDir, 'gold-standards');
  let goldStatus: CheckStatus = 'passed';
  let goldMessage = 'Gold standards are linked correctly.';
  if (fs.existsSync(goldStandardsDir)) {
    const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
    let benchmarks: any[] = [];
    if (fs.existsSync(benchmarksPath)) {
      try {
        benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8'));
      } catch {
        /* treated as no benchmarks */
      }
    }
    const orphanedGolds: string[] = [];
    for (const file of fs.readdirSync(goldStandardsDir)) {
      if (file.endsWith('.json')) {
        try {
          const gold = JSON.parse(fs.readFileSync(path.join(goldStandardsDir, file), 'utf-8'));
          if (gold.benchmarkId && !benchmarks.some((b: any) => b.id === gold.benchmarkId)) {
            orphanedGolds.push(gold.id || file);
          }
        } catch {
          orphanedGolds.push(file);
        }
      }
    }
    if (orphanedGolds.length > 0) {
      goldStatus = 'warning';
      goldMessage = `Gold Standards referencing missing benchmarks: ${orphanedGolds.join(', ')}`;
    }
  }
  checks.push({ id: 'gold-standard-orphans', name: 'Gold Standard Dependency Tracking', status: goldStatus, message: goldMessage, repairable: true });

  // 7. Empty / malformed eval files
  let emptyStatus: CheckStatus = 'passed';
  let emptyMessage = 'All files uncorrupted.';
  let malformedCount = 0;
  if (fs.existsSync(evalsDir)) {
    for (const f of ['benchmarks.json', 'regression_runs.json', 'judges.json', 'promotions.json']) {
      const fPath = path.join(evalsDir, f);
      if (fs.existsSync(fPath)) {
        try {
          const stats = fs.statSync(fPath);
          if (stats.size === 0) throw new Error('empty file');
          JSON.parse(fs.readFileSync(fPath, 'utf-8'));
        } catch {
          malformedCount++;
        }
      }
    }
  }
  if (malformedCount > 0) {
    emptyStatus = 'failed';
    emptyMessage = `Malformed count: ${malformedCount}`;
  }
  checks.push({ id: 'empty-malformed-files', name: 'Timeline & Evaluations Syntax Health', status: emptyStatus, message: emptyMessage, repairable: true });

  const hasFailed = checks.some((c) => c.status === 'failed');
  const hasWarning = checks.some((c) => c.status === 'warning');
  const status: DoctorReport['status'] = hasFailed ? 'critical' : hasWarning ? 'warning' : 'healthy';

  return { status, checks };
}

/** Appends a checksummed remediation record to the provenance ledger, mirroring main.ts's recordRemediationProvenance. */
function appendRemediationRecord(govDir: string, record: any): void {
  const pPath = path.join(govDir, 'provenance.json');
  let data: { records: any[] } = { records: [] };
  if (fs.existsSync(pPath)) {
    try {
      data = JSON.parse(fs.readFileSync(pPath, 'utf-8'));
    } catch {
      /* start fresh on a corrupt ledger */
    }
  }
  record.hash = computeDeterministicHash(record);
  record.integrityStatus = 'verified';
  data.records.unshift(record);
  fs.writeFileSync(pPath, JSON.stringify(data, null, 2));
}

/**
 * Repairs a single named check, mirroring main.ts's doctor:repair handler for
 * the 7 ported check ids. Returns true if the checkId was recognized.
 */
export function repairWorkspaceDoctorCheck(rootPath: string, checkId: string): boolean {
  const baseDir = path.join(rootPath, '.agentdeck');
  const govDir = path.join(baseDir, 'governance');
  const evalsDir = path.join(baseDir, 'evals');
  const snapshotsDir = path.join(baseDir, 'snapshots');
  const goldStandardsDir = path.join(evalsDir, 'gold-standards');
  const timestamp = Date.now();

  if (checkId === 'folders-exist') {
    for (const sub of ['evals', 'timeline', 'governance', 'snapshots']) {
      fs.mkdirSync(path.join(baseDir, sub), { recursive: true });
    }
    return true;
  }

  if (checkId === 'governance-schema') {
    const policiesPath = path.join(govDir, 'policies.json');
    if (fs.existsSync(policiesPath)) {
      fs.copyFileSync(policiesPath, `${policiesPath}.bak-${timestamp}`);
    }
    const defaultPolicies: any = {
      schemaVersion: 'agentdeck.governance.v1',
      minScore: 0.85,
      allowRegression: false,
      requireApproval: true,
    };
    defaultPolicies.hash = computeDeterministicHash(defaultPolicies);
    defaultPolicies.integrityStatus = 'verified';
    fs.writeFileSync(policiesPath, JSON.stringify(defaultPolicies, null, 2));

    const candidatesPath = path.join(govDir, 'release_candidates.json');
    if (fs.existsSync(candidatesPath)) {
      fs.copyFileSync(candidatesPath, `${candidatesPath}.bak-${timestamp}`);
      try {
        const list = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
        const compliant: any[] = [];
        if (Array.isArray(list)) {
          for (const rc of list) {
            if (rc.schemaVersion !== 'agentdeck.governance.v1') continue;
            if (verifyIntegrityHash(rc) === 'tampered') {
              const compPath = path.join(govDir, `candidate-${rc.id}.json.compromised`);
              fs.writeFileSync(compPath, JSON.stringify(rc, null, 2));
              appendRemediationRecord(govDir, {
                schemaVersion: 'agentdeck.provenance.v1',
                id: `prov-remed-${crypto.randomUUID()}`,
                timestamp: Date.now(),
                actor: 'system',
                mutationType: 'release_candidate_updated',
                sourceType: 'release_candidate',
                sourceId: rc.id || 'unknown',
                before: { status: rc.status },
                after: { status: 'quarantined', message: `Release Candidate ${rc.id} tampered. Removed from registry and quarantined.` },
              });
            } else {
              compliant.push(rc);
            }
          }
        }
        fs.writeFileSync(candidatesPath, JSON.stringify(compliant, null, 2));
      } catch {
        fs.writeFileSync(candidatesPath, JSON.stringify([], null, 2));
      }
    }
    return true;
  }

  if (checkId === 'snapshots-integrity') {
    if (fs.existsSync(snapshotsDir)) {
      for (const file of fs.readdirSync(snapshotsDir)) {
        if (file.endsWith('.json') && !file.startsWith('temp_') && !file.includes('.compromised') && !file.includes('.bak')) {
          const filePath = path.join(snapshotsDir, file);
          try {
            const snap = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (snap.manifest) {
              const integrity = verifyIntegrityHash(snap);
              if (integrity === 'unsigned') {
                snap.manifest.hash = computeDeterministicHash(snap);
                fs.writeFileSync(filePath, JSON.stringify(snap, null, 2));
              } else if (integrity === 'tampered') {
                const compPath = path.join(snapshotsDir, `${file}.compromised`);
                fs.renameSync(filePath, compPath);
                appendRemediationRecord(govDir, {
                  schemaVersion: 'agentdeck.provenance.v1',
                  id: `prov-remed-${crypto.randomUUID()}`,
                  timestamp: Date.now(),
                  actor: 'system',
                  mutationType: 'snapshot_restored',
                  sourceType: 'snapshot',
                  sourceId: snap.manifest.snapshotId || file,
                  before: { file, status: 'tampered' },
                  after: { file: `${file}.compromised`, status: 'quarantined', message: `Snapshot ${snap.manifest.snapshotId || file} tampered. Quarantined.` },
                });
              }
            }
          } catch {
            fs.copyFileSync(filePath, `${filePath}.bak-${timestamp}`);
            fs.unlinkSync(filePath);
          }
        }
      }
    }
    return true;
  }

  if (checkId === 'provenance-tamper') {
    const provenancePath = path.join(govDir, 'provenance.json');
    if (fs.existsSync(provenancePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(provenancePath, 'utf-8'));
        const hasTampered = Array.isArray(data.records) && data.records.some((r: any) => verifyIntegrityHash(r) === 'tampered');
        if (hasTampered) {
          fs.copyFileSync(provenancePath, `${provenancePath}.bak-${timestamp}`);
          fs.renameSync(provenancePath, `${provenancePath}.compromised`);
          const remediation: any = {
            schemaVersion: 'agentdeck.provenance.v1',
            id: `prov-remed-${crypto.randomUUID()}`,
            timestamp: Date.now(),
            actor: 'system',
            mutationType: 'policy_updated',
            sourceType: 'policy',
            sourceId: 'provenance-ledger',
            before: { status: 'tampered_archived' },
            after: { status: 'reinitialized_clean', message: 'Quarantined tampered provenance ledger and re-seeded fresh ledger.' },
          };
          remediation.hash = computeDeterministicHash(remediation);
          remediation.integrityStatus = 'verified';
          fs.writeFileSync(provenancePath, JSON.stringify({ records: [remediation] }, null, 2));
        } else {
          let sealedCount = 0;
          for (const record of data.records || []) {
            if (!record.hash) {
              record.hash = computeDeterministicHash(record);
              record.integrityStatus = 'verified';
              sealedCount++;
            }
          }
          if (sealedCount > 0) {
            fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2));
          }
        }
      } catch {
        fs.copyFileSync(provenancePath, `${provenancePath}.bak-${timestamp}`);
        fs.writeFileSync(provenancePath, JSON.stringify({ records: [] }, null, 2));
      }
    }
    return true;
  }

  if (checkId === 'provenance-chronology') {
    const provenancePath = path.join(govDir, 'provenance.json');
    if (fs.existsSync(provenancePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(provenancePath, 'utf-8'));
        const seen = new Set<string>();
        const uniques = (data.records || []).filter((r: any) => {
          if (!r.id || seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        uniques.sort((a: any, b: any) => b.timestamp - a.timestamp);
        data.records = uniques;
        fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2));
      } catch {
        /* leave ledger untouched on unexpected shape */
      }
    }
    return true;
  }

  if (checkId === 'gold-standard-orphans') {
    if (fs.existsSync(goldStandardsDir)) {
      const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
      let benchmarks: any[] = [];
      if (fs.existsSync(benchmarksPath)) {
        try {
          benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8'));
        } catch {
          /* treated as no benchmarks */
        }
      }
      for (const file of fs.readdirSync(goldStandardsDir)) {
        if (file.endsWith('.json')) {
          const filePath = path.join(goldStandardsDir, file);
          try {
            const gold = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (gold.benchmarkId && !benchmarks.some((b: any) => b.id === gold.benchmarkId)) {
              fs.copyFileSync(filePath, `${filePath}.bak-${timestamp}`);
              fs.unlinkSync(filePath);
            }
          } catch {
            fs.unlinkSync(filePath);
          }
        }
      }
    }
    return true;
  }

  if (checkId === 'empty-malformed-files') {
    for (const f of ['benchmarks.json', 'regression_runs.json', 'judges.json', 'promotions.json']) {
      const fPath = path.join(evalsDir, f);
      if (fs.existsSync(fPath)) {
        try {
          const stats = fs.statSync(fPath);
          if (stats.size === 0) throw new Error('empty file');
          JSON.parse(fs.readFileSync(fPath, 'utf-8'));
        } catch {
          fs.copyFileSync(fPath, `${fPath}.bak-${timestamp}`);
          fs.writeFileSync(fPath, JSON.stringify([], null, 2));
        }
      }
    }
    return true;
  }

  return false;
}
