import type { IpcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { computeHash, verifyHash } from '../../src/lib/integrityChecksum';
import { isWorkspaceRootSafe } from '../../src/lib/pathSafety';

/**
 * Doctor IPC handlers (doctor:run-checks / repair / export-diagnostic-bundle)
 * plus the runDoctorChecksInternal helper. Relocated VERBATIM from
 * electron/main.ts (W5 PR 11) as a behavior-preserving change -- NO adoption of
 * src/lib/workspaceDoctor.ts (that characterization module is known not to match
 * this inline behavior; any parity merge is a separate, gated PR). Every check,
 * message, severity, status, repair path, and the in-body PRESET_IDS constants
 * are unchanged. The only mechanical edit is the module constant DATA_DIR ->
 * the injected `dataDir`.
 *
 * runDoctorChecksInternal is returned from registerDoctorHandlers so main.ts's
 * dep:generate handler (still inline, W5 PR 12) can keep calling it with the
 * same (rootPath, presetId) signature.
 *
 * Dependencies: the five DATA_DIR-bound resolvers plus dataDir are injected;
 * dialog + BrowserWindow are injected for the export save-dialog. computeHash/
 * verifyHash (canonical integrityChecksum), isWorkspaceRootSafe (pathSafety),
 * and node crypto/fs/path are imported directly. The block never reads
 * mainWindow and logs only via console.error. All three channels use
 * ipcMain.handle.
 */
export interface DoctorHandlerDeps {
  ipcMain: IpcMain;
  dialog: typeof import('electron').dialog;
  BrowserWindow: typeof import('electron').BrowserWindow;
  getEvalsDir: (rootPath: string | null, presetId: string) => string;
  getTimelineDir: (rootPath: string | null, presetId: string) => string;
  getGovernanceDir: (rootPath: string | null, presetId: string) => string;
  getProvenancePath: (rootPath: string | null, presetId: string) => string;
  getSnapshotsDir: (rootPath: string | null, presetId: string) => string;
  dataDir: string;
}

export function registerDoctorHandlers(deps: DoctorHandlerDeps): {
  runDoctorChecksInternal: (rootPath: string | null, presetId: string) => Promise<any>;
  recordRemediationProvenance: (rootPath: string | null, presetId: string, record: any) => Promise<void>;
} {
  const {
    ipcMain, dialog, BrowserWindow,
    getEvalsDir, getTimelineDir, getGovernanceDir, getProvenancePath, getSnapshotsDir,
    dataDir,
  } = deps;

async function runDoctorChecksInternal(rootPath: string | null, presetId: string): Promise<any> {
  const checks: any[] = [];
  const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
  
  // 1. Folders exist check
  let baseExists = false;
  const missingDirs: string[] = [];
  
  if (PRESET_IDS.includes(presetId)) {
    const baseDir = path.join(dataDir, 'presets-evals', presetId);
    baseExists = fs.existsSync(baseDir);
    if (!baseExists) {
      missingDirs.push(baseDir);
    } else {
      const subdirs = ['timeline', 'governance', 'snapshots'];
      for (const sub of subdirs) {
        if (!fs.existsSync(path.join(baseDir, sub))) {
          missingDirs.push(sub);
        }
      }
    }
  } else {
    if (rootPath && isWorkspaceRootSafe(rootPath) && fs.existsSync(rootPath)) {
      const baseDir = path.join(rootPath, '.agentdeck');
      baseExists = fs.existsSync(baseDir);
      if (!baseExists) {
        missingDirs.push('.agentdeck');
      } else {
        const subdirs = ['evals', 'timeline', 'governance', 'snapshots'];
        for (const sub of subdirs) {
          if (!fs.existsSync(path.join(baseDir, sub))) {
            missingDirs.push(`.agentdeck/${sub}`);
          }
        }
      }
    } else {
      missingDirs.push('rootPath');
    }
  }
  
  const foldersCheck: any = {
    id: 'folders-exist',
    name: 'Workspace Directories Existence',
    description: 'Verifies that .agentdeck base folders and subdirectories exist.',
    status: 'passed',
    message: 'All workspace subdirectories exist.',
    repairable: true,
    repairType: 'recreate',
    repairSuggestion: 'Recreate missing .agentdeck subdirectories.'
  };
  if (missingDirs.length > 0) {
    foldersCheck.status = 'failed';
    foldersCheck.message = `Missing folders: ${missingDirs.join(', ')}`;
    foldersCheck.details = { missingDirs };
  }
  checks.push(foldersCheck);
  
  // 2. Invalid governance schema check
  const govCheck: any = {
    id: 'governance-schema',
    name: 'Governance Schema and Schema Version Validity',
    description: 'Ensures policies.json and release_candidates.json conform to policies schemas and v1 schemaVersion.',
    status: 'passed',
    message: 'Governance files are schema compliant.',
    repairable: true,
    repairType: 'backup-repair',
    repairSuggestion: 'Restore default compliant governance schemas.'
  };
  
  const govDir = getGovernanceDir(rootPath, presetId);
  const policiesPath = path.join(govDir, 'policies.json');
  const candidatesPath = path.join(govDir, 'release_candidates.json');
  
  let candidatesList: any[] = [];
  
  if (fs.existsSync(policiesPath)) {
    try {
      const content = fs.readFileSync(policiesPath, 'utf-8');
      const policies = JSON.parse(content);
      if (policies.schemaVersion !== 'agentdeck.governance.v1') {
        govCheck.status = 'failed';
        govCheck.message = `policies.json has invalid schema version: ${policies.schemaVersion || 'none'}`;
      } else if (typeof policies.minScore !== 'number') {
        govCheck.status = 'failed';
        govCheck.message = 'policies.json missing minScore configuration';
      }
    } catch (e: any) {
      govCheck.status = 'failed';
      govCheck.message = `Malformed policies.json: ${e.message}`;
    }
  }
  
  if (fs.existsSync(candidatesPath) && govCheck.status === 'passed') {
    try {
      const content = fs.readFileSync(candidatesPath, 'utf-8');
      candidatesList = JSON.parse(content);
      if (!Array.isArray(candidatesList)) {
        govCheck.status = 'failed';
        govCheck.message = 'release_candidates.json must be an array';
      } else {
        for (const rc of candidatesList) {
          if (rc.schemaVersion !== 'agentdeck.governance.v1') {
            govCheck.status = 'failed';
            govCheck.message = `Release candidate ${rc.id || 'unknown'} has invalid schema version: ${rc.schemaVersion || 'none'}`;
            break;
          }
          if (verifyHash(rc) === 'tampered') {
            govCheck.status = 'failed';
            govCheck.message = `Release candidate ${rc.id || 'unknown'} has a checksum mismatch.`;
            govCheck.repairType = 'remediate';
            govCheck.repairSuggestion = 'Quarantine the candidate record with a checksum mismatch and review system integrity.';
            break;
          }
        }
      }
    } catch (e: any) {
      govCheck.status = 'failed';
      govCheck.message = `Malformed release_candidates.json: ${e.message}`;
    }
  }
  checks.push(govCheck);

  // 3. Broken snapshot manifests check
  const snapshotsCheck: any = {
    id: 'snapshots-integrity',
    name: 'Snapshot Manifest Verification',
    description: 'Scans all snapshot manifests for checksum mismatches or missing checksums.',
    status: 'passed',
    message: 'All snapshots are verified and intact.',
    repairable: true,
    repairType: 'seal',
    repairSuggestion: 'Recompute checksums for snapshot manifests that have none.'
  };
  
  const snapshotsDir = getSnapshotsDir(rootPath, presetId);
  const tamperedSnaps: string[] = [];
  const unsignedSnaps: string[] = [];
  
  if (fs.existsSync(snapshotsDir)) {
    const files = fs.readdirSync(snapshotsDir);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('temp_') && !file.includes('.compromised') && !file.includes('.bak')) {
        try {
          const filePath = path.join(snapshotsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const snap = JSON.parse(content);
          
          if (snap.manifest) {
            const integrity = verifyHash(snap);
            if (integrity === 'tampered') {
              tamperedSnaps.push(snap.manifest.snapshotId || file);
            } else if (integrity === 'unsigned') {
              unsignedSnaps.push(snap.manifest.snapshotId || file);
            }
          }
        } catch (e) {
          tamperedSnaps.push(file);
        }
      }
    }
  }
  
  if (tamperedSnaps.length > 0) {
    snapshotsCheck.status = 'failed';
    snapshotsCheck.message = `Snapshots with a checksum mismatch: ${tamperedSnaps.join(', ')}`;
    snapshotsCheck.repairType = 'remediate';
    snapshotsCheck.repairSuggestion = 'Quarantine snapshots with a checksum mismatch and review system logs.';
    snapshotsCheck.details = { tamperedSnaps, unsignedSnaps };
  } else if (unsignedSnaps.length > 0) {
    snapshotsCheck.status = 'warning';
    snapshotsCheck.message = `Snapshots with no integrity checksum: ${unsignedSnaps.join(', ')}`;
    snapshotsCheck.repairType = 'seal';
    snapshotsCheck.repairSuggestion = 'Recompute integrity checksums for snapshot records that have none.';
    snapshotsCheck.details = { tamperedSnaps, unsignedSnaps };
  }
  checks.push(snapshotsCheck);

  // 4. Tampered provenance records check
  const provenanceCheck: any = {
    id: 'provenance-tamper',
    name: 'Provenance Integrity Checksums',
    description: 'Detects checksum mismatches in the provenance mutation ledger.',
    status: 'passed',
    message: 'Provenance ledger is verified and intact.',
    repairable: true,
    repairType: 'seal',
    repairSuggestion: 'Recompute checksums for provenance records that have none.'
  };
  
  const provenancePath = getProvenancePath(rootPath, presetId);
  let provenanceData: { records: any[] } = { records: [] };
  const tamperedProvIds: string[] = [];
  const unsignedProvIds: string[] = [];
  
  if (fs.existsSync(provenancePath)) {
    try {
      const content = fs.readFileSync(provenancePath, 'utf-8');
      provenanceData = JSON.parse(content);
      if (provenanceData.records && Array.isArray(provenanceData.records)) {
        for (const rec of provenanceData.records) {
          const integrity = verifyHash(rec);
          if (integrity === 'tampered') {
            tamperedProvIds.push(rec.id || 'unknown');
          } else if (integrity === 'unsigned') {
            unsignedProvIds.push(rec.id || 'unknown');
          }
        }
      }
    } catch (e: any) {
      provenanceCheck.status = 'failed';
      provenanceCheck.message = `Malformed provenance.json: ${e.message}`;
    }
  }
  
  if (tamperedProvIds.length > 0) {
    provenanceCheck.status = 'failed';
    provenanceCheck.message = `Provenance records with a checksum mismatch: ${tamperedProvIds.join(', ')}`;
    provenanceCheck.repairType = 'remediate';
    provenanceCheck.repairSuggestion = 'Quarantine provenance entries with a checksum mismatch and rebuild a clean baseline log.';
    provenanceCheck.details = { tamperedProvIds, unsignedProvIds };
  } else if (unsignedProvIds.length > 0) {
    provenanceCheck.status = 'warning';
    provenanceCheck.message = `Provenance records with no integrity checksum: ${unsignedProvIds.join(', ')}`;
    provenanceCheck.repairType = 'seal';
    provenanceCheck.repairSuggestion = 'Recompute checksums for provenance ledger records that have none.';
    provenanceCheck.details = { tamperedProvIds, unsignedProvIds };
  }
  checks.push(provenanceCheck);

  // 5. Provenance Chronology Check
  const chronologyCheck: any = {
    id: 'provenance-chronology',
    name: 'Provenance Chronological Ordering and Metadata Checks',
    description: 'Validates that provenance logs are ordered, have no duplicates, and have complete mutation schemas.',
    status: 'passed',
    message: 'Provenance chronology and details are valid.',
    repairable: true,
    repairType: 'backup-repair',
    repairSuggestion: 'Re-sort provenance records chronologically and deduplicate.'
  };
  
  if (provenanceCheck.status !== 'failed' && fs.existsSync(provenancePath)) {
    const records = provenanceData.records;
    const seenIds = new Set<string>();
    let ordered = true;
    let duplicateIds: string[] = [];
    let schemaIncompleteIds: string[] = [];
    let invalidTimestamps: string[] = [];
    
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      
      // Duplicate IDs
      if (rec.id) {
        if (seenIds.has(rec.id)) {
          duplicateIds.push(rec.id);
        }
        seenIds.add(rec.id);
      } else {
        duplicateIds.push(`index-${i}`);
      }
      
      // Timestamp validity
      if (typeof rec.timestamp !== 'number' || isNaN(rec.timestamp)) {
        invalidTimestamps.push(rec.id || `index-${i}`);
      }
      
      // Schema completeness
      if (!rec.sourceType || !rec.mutationType || rec.before === undefined || rec.after === undefined) {
        schemaIncompleteIds.push(rec.id || `index-${i}`);
      }
      
      // Chronology order (descending order expected: index 0 is newest)
      if (i > 0) {
        const prev = records[i - 1];
        if (prev.timestamp < rec.timestamp) {
          ordered = false;
        }
      }
    }
    
    if (duplicateIds.length > 0 || invalidTimestamps.length > 0 || schemaIncompleteIds.length > 0 || !ordered) {
      let issues: string[] = [];
      if (duplicateIds.length > 0) issues.push(`Duplicate IDs: ${duplicateIds.join(', ')}`);
      if (invalidTimestamps.length > 0) issues.push(`Invalid timestamps: ${invalidTimestamps.join(', ')}`);
      if (schemaIncompleteIds.length > 0) issues.push(`Incomplete schemas: ${schemaIncompleteIds.join(', ')}`);
      if (!ordered) issues.push('Chronological ordering is incorrect');
      
      chronologyCheck.status = 'failed';
      chronologyCheck.message = issues.join('; ');
      chronologyCheck.details = { duplicateIds, invalidTimestamps, schemaIncompleteIds, ordered };
    }
  }
  checks.push(chronologyCheck);

  // 6. Missing baseline / release candidate mismatch
  const mismatchCheck: any = {
    id: 'rc-references',
    name: 'Release Candidate Evaluation Linkage',
    description: 'Ensures release candidates map to active timeline events and regression run history.',
    status: 'passed',
    message: 'All Release Candidates have valid evaluation references.',
    repairable: true,
    repairType: 'prune',
    repairSuggestion: 'Prune orphaned references in Release Candidates.'
  };
  
  if (govCheck.status === 'passed' && candidatesList.length > 0) {
    const evalsDir = getEvalsDir(rootPath, presetId);
    const runsPath = path.join(evalsDir, 'regression_runs.json');
    let runs: any[] = [];
    if (fs.existsSync(runsPath)) {
      try {
        runs = JSON.parse(fs.readFileSync(runsPath, 'utf-8'));
      } catch (e) {}
    }
    
    const timelineDir = getTimelineDir(rootPath, presetId);
    let timelineEventIds: string[] = [];
    if (fs.existsSync(timelineDir)) {
      const files = fs.readdirSync(timelineDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const match = file.match(/^event-(.+)\.json$/);
          if (match) {
            timelineEventIds.push(match[1]);
          }
        }
      }
    }
    
    const orphanedRCs: string[] = [];
    for (const rc of candidatesList) {
      const runExists = rc.runId ? runs.some((r: any) => r.id === rc.runId) : true;
      const timelineEventExists = rc.timelineEventId ? timelineEventIds.includes(rc.timelineEventId) : true;
      
      if (!runExists || !timelineEventExists) {
        orphanedRCs.push(rc.id || 'unknown');
      }
    }
    
    if (orphanedRCs.length > 0) {
      mismatchCheck.status = 'warning';
      mismatchCheck.message = `Release Candidates with missing evaluation/run references: ${orphanedRCs.join(', ')}`;
      mismatchCheck.details = { orphanedRCs };
    }
  }
  checks.push(mismatchCheck);

  // 7. Gold standard orphan references
  const goldOrphanCheck: any = {
    id: 'gold-standard-orphans',
    name: 'Gold Standard Dependency Tracking',
    description: 'Ensures gold standards reference active benchmarks or targets.',
    status: 'passed',
    message: 'Gold standards are linked correctly.',
    repairable: true,
    repairType: 'prune',
    repairSuggestion: 'Clean up orphaned gold standard references.'
  };
  
  const evalsDir = getEvalsDir(rootPath, presetId);
  const goldStandardsDir = path.join(evalsDir, 'gold-standards');
  
  if (fs.existsSync(goldStandardsDir)) {
    const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
    let benchmarks: any[] = [];
    if (fs.existsSync(benchmarksPath)) {
      try {
        benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8'));
      } catch (e) {}
    }
    
    const orphanedGolds: string[] = [];
    const files = fs.readdirSync(goldStandardsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const fileData = fs.readFileSync(path.join(goldStandardsDir, file), 'utf-8');
          const gold = JSON.parse(fileData);
          if (gold.benchmarkId) {
            const benchExists = benchmarks.some((b: any) => b.id === gold.benchmarkId);
            if (!benchExists) {
              orphanedGolds.push(gold.id || file);
            }
          }
        } catch (e) {
          orphanedGolds.push(file);
        }
      }
    }
    
    if (orphanedGolds.length > 0) {
      goldOrphanCheck.status = 'warning';
      goldOrphanCheck.message = `Gold Standards referencing missing benchmarks: ${orphanedGolds.join(', ')}`;
      goldOrphanCheck.details = { orphanedGolds };
    }
  }
  checks.push(goldOrphanCheck);

  // 8. Empty or malformed timeline/evaluations files
  const emptyCheck: any = {
    id: 'empty-malformed-files',
    name: 'Timeline & Evaluations Syntax Health',
    description: 'Ensures core metadata lists and telemetry event files are not malformed or empty.',
    status: 'passed',
    message: 'All metadata files are uncorrupted and parse successfully.',
    repairable: true,
    repairType: 'backup-repair',
    repairSuggestion: 'Backup and restore compliant templates for malformed logs.'
  };
  
  const malformedFiles: string[] = [];
  const evalFilesToCheck = ['benchmarks.json', 'regression_runs.json', 'judges.json', 'promotions.json'];
  
  for (const f of evalFilesToCheck) {
    const fPath = path.join(evalsDir, f);
    if (fs.existsSync(fPath)) {
      try {
        const stats = fs.statSync(fPath);
        if (stats.size === 0) {
          malformedFiles.push(f);
        } else {
          JSON.parse(fs.readFileSync(fPath, 'utf-8'));
        }
      } catch (e) {
        malformedFiles.push(f);
      }
    }
  }
  
  const timelineDir = getTimelineDir(rootPath, presetId);
  if (fs.existsSync(timelineDir)) {
    const files = fs.readdirSync(timelineDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const fPath = path.join(timelineDir, file);
        try {
          const stats = fs.statSync(fPath);
          if (stats.size === 0) {
            malformedFiles.push(`timeline/${file}`);
          } else {
            JSON.parse(fs.readFileSync(fPath, 'utf-8'));
          }
        } catch (e) {
          malformedFiles.push(`timeline/${file}`);
        }
      }
    }
  }
  
  if (malformedFiles.length > 0) {
    emptyCheck.status = 'failed';
    emptyCheck.message = `Malformed/empty files: ${malformedFiles.join(', ')}`;
    emptyCheck.details = { malformedFiles };
  }
  checks.push(emptyCheck);

  // Calculate Overall Status
  let overallStatus = 'healthy';
  const hasFailed = checks.some(c => c.status === 'failed');
  const hasWarning = checks.some(c => c.status === 'warning');
  
  if (hasFailed) {
    overallStatus = 'critical';
  } else if (hasWarning) {
    overallStatus = 'warning';
  }
  
  return {
    status: overallStatus,
    timestamp: Date.now(),
    checks
  };
}

// IPC Handlers for Workspace Doctor
ipcMain.handle('doctor:run-checks', async (_event, { rootPath, presetId }) => {
  try {
    return await runDoctorChecksInternal(rootPath, presetId);
  } catch (error: any) {
    console.error('Failed to run doctor checks:', error);
    return {
      status: 'critical',
      timestamp: Date.now(),
      checks: [
        {
          id: 'internal-error',
          name: 'Doctor Internal Status',
          description: 'Tracks whether the diagnostics engine itself failed to run.',
          status: 'failed',
          message: `Diagnostics run crashed: ${error.message}`,
          repairable: false,
          repairType: 'none'
        }
      ]
    };
  }
});

ipcMain.handle('doctor:repair', async (_event, { rootPath, presetId, checkId }) => {
  try {
    const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
    const govDir = getGovernanceDir(rootPath, presetId);
    const evalsDir = getEvalsDir(rootPath, presetId);
    const snapshotsDir = getSnapshotsDir(rootPath, presetId);
    const timelineDir = getTimelineDir(rootPath, presetId);
    const goldStandardsDir = path.join(evalsDir, 'gold-standards');

    const timestamp = Date.now();

    if (checkId === 'folders-exist') {
      if (PRESET_IDS.includes(presetId)) {
        const baseDir = path.join(dataDir, 'presets-evals', presetId);
        const subdirs = ['timeline', 'governance', 'snapshots'];
        for (const sub of subdirs) {
          const p = path.join(baseDir, sub);
          if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        }
      } else if (rootPath) {
        const baseDir = path.join(rootPath, '.agentdeck');
        const subdirs = ['evals', 'timeline', 'governance', 'snapshots'];
        for (const sub of subdirs) {
          const p = path.join(baseDir, sub);
          if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        }
      }
      return { success: true };
    }

    if (checkId === 'governance-schema') {
      const policiesPath = path.join(govDir, 'policies.json');
      const candidatesPath = path.join(govDir, 'release_candidates.json');

      // Backup policies
      if (fs.existsSync(policiesPath)) {
        fs.copyFileSync(policiesPath, `${policiesPath}.bak-${timestamp}`);
      }
      // Re-seed default compliant policies
      const defaultPolicies = {
        schemaVersion: 'agentdeck.governance.v1',
        minScore: 0.85,
        allowRegression: false,
        requireApproval: true
      };
      (defaultPolicies as any).hash = computeHash(defaultPolicies);
      (defaultPolicies as any).integrityStatus = 'verified';
      fs.writeFileSync(policiesPath, JSON.stringify(defaultPolicies, null, 2), 'utf-8');

      // Backup and repair candidates
      if (fs.existsSync(candidatesPath)) {
        fs.copyFileSync(candidatesPath, `${candidatesPath}.bak-${timestamp}`);
        try {
          const content = fs.readFileSync(candidatesPath, 'utf-8');
          const list = JSON.parse(content);
          if (Array.isArray(list)) {
            const compliantList: any[] = [];
            for (const rc of list) {
              if (rc.schemaVersion !== 'agentdeck.governance.v1') {
                continue;
              }
              const integrity = verifyHash(rc);
              if (integrity === 'tampered') {
                // Quarantine as compromised
                const compPath = path.join(govDir, `candidate-${rc.id}.json.compromised`);
                fs.writeFileSync(compPath, JSON.stringify(rc, null, 2), 'utf-8');
                
                // Add remediation record
                const remediation = {
                  schemaVersion: "agentdeck.provenance.v1",
                  id: `prov-remed-${crypto.randomUUID()}`,
                  timestamp: Date.now(),
                  actor: "system",
                  mutationType: "release_candidate_updated",
                  sourceType: "release_candidate",
                  sourceId: rc.id || 'unknown',
                  before: { status: rc.status },
                  after: { status: 'quarantined', message: `Release Candidate ${rc.id} tampered. Removed from registry and quarantined.` }
                };
                await recordRemediationProvenance(rootPath, presetId, remediation);
              } else {
                compliantList.push(rc);
              }
            }
            fs.writeFileSync(candidatesPath, JSON.stringify(compliantList, null, 2), 'utf-8');
          } else {
            fs.writeFileSync(candidatesPath, JSON.stringify([], null, 2), 'utf-8');
          }
        } catch (e) {
          fs.writeFileSync(candidatesPath, JSON.stringify([], null, 2), 'utf-8');
        }
      }
      return { success: true };
    }

    if (checkId === 'snapshots-integrity') {
      if (fs.existsSync(snapshotsDir)) {
        const files = fs.readdirSync(snapshotsDir);
        for (const file of files) {
          if (file.endsWith('.json') && !file.startsWith('temp_') && !file.includes('.compromised') && !file.includes('.bak')) {
            const filePath = path.join(snapshotsDir, file);
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const snap = JSON.parse(content);
              if (snap.manifest) {
                const integrity = verifyHash(snap);
                if (integrity === 'unsigned') {
                  // Seal it
                  snap.manifest.hash = computeHash(snap);
                  fs.writeFileSync(filePath, JSON.stringify(snap, null, 2), 'utf-8');
                } else if (integrity === 'tampered') {
                  // Quarantine
                  const compPath = path.join(snapshotsDir, `${file}.compromised`);
                  fs.renameSync(filePath, compPath);
                  
                  // Add remediation record
                  const remediation = {
                    schemaVersion: "agentdeck.provenance.v1",
                    id: `prov-remed-${crypto.randomUUID()}`,
                    timestamp: Date.now(),
                    actor: "system",
                    mutationType: "snapshot_restored",
                    sourceType: "snapshot",
                    sourceId: snap.manifest.snapshotId || file,
                    before: { file, status: 'tampered' },
                    after: { file: `${file}.compromised`, status: 'quarantined', message: `Snapshot ${snap.manifest.snapshotId || file} tampered. Quarantined.` }
                  };
                  await recordRemediationProvenance(rootPath, presetId, remediation);
                }
              }
            } catch (e) {
              fs.copyFileSync(filePath, `${filePath}.bak-${timestamp}`);
              fs.unlinkSync(filePath);
            }
          }
        }
      }
      return { success: true };
    }

    if (checkId === 'provenance-tamper') {
      const provenancePath = getProvenancePath(rootPath, presetId);
      if (fs.existsSync(provenancePath)) {
        try {
          const content = fs.readFileSync(provenancePath, 'utf-8');
          const data = JSON.parse(content);
          if (data.records && Array.isArray(data.records)) {
            const hasTampered = data.records.some((r: any) => verifyHash(r) === 'tampered');
            
            if (hasTampered) {
              fs.copyFileSync(provenancePath, `${provenancePath}.bak-${timestamp}`);
              fs.renameSync(provenancePath, `${provenancePath}.compromised`);
              
              const freshLedger = { records: [] as any[] };
              const remediation = {
                schemaVersion: "agentdeck.provenance.v1",
                id: `prov-remed-${crypto.randomUUID()}`,
                timestamp: Date.now(),
                actor: "system",
                mutationType: "policy_updated",
                sourceType: "policy",
                sourceId: "provenance-ledger",
                before: { status: "tampered_archived" },
                after: { status: "reinitialized_clean", message: "Quarantined tampered provenance ledger and re-seeded fresh ledger." }
              };
              (remediation as any).hash = computeHash(remediation);
              (remediation as any).integrityStatus = 'verified';
              freshLedger.records.push(remediation);
              
              fs.writeFileSync(provenancePath, JSON.stringify(freshLedger, null, 2), 'utf-8');
            } else {
              let sealedCount = 0;
              for (const record of data.records) {
                if (!record.hash) {
                  record.hash = computeHash(record);
                  record.integrityStatus = 'verified';
                  sealedCount++;
                }
              }
              if (sealedCount > 0) {
                fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2), 'utf-8');
              }
            }
          }
        } catch (e) {
          fs.copyFileSync(provenancePath, `${provenancePath}.bak-${timestamp}`);
          fs.writeFileSync(provenancePath, JSON.stringify({ records: [] }, null, 2), 'utf-8');
        }
      }
      return { success: true };
    }

    if (checkId === 'provenance-chronology') {
      const provenancePath = getProvenancePath(rootPath, presetId);
      if (fs.existsSync(provenancePath)) {
        fs.copyFileSync(provenancePath, `${provenancePath}.bak-${timestamp}`);
        try {
          const content = fs.readFileSync(provenancePath, 'utf-8');
          const data = JSON.parse(content);
          if (data.records && Array.isArray(data.records)) {
            const seenIds = new Set<string>();
            const uniqueRecords = data.records.filter((rec: any) => {
              if (!rec.id || seenIds.has(rec.id)) {
                return false;
              }
              seenIds.add(rec.id);
              return true;
            });
            
            uniqueRecords.sort((a: any, b: any) => b.timestamp - a.timestamp);
            
            for (const rec of uniqueRecords) {
              let modified = false;
              if (!rec.sourceType) { rec.sourceType = 'policy'; modified = true; }
              if (!rec.mutationType) { rec.mutationType = 'policy_updated'; modified = true; }
              if (rec.before === undefined) { rec.before = {}; modified = true; }
              if (rec.after === undefined) { rec.after = {}; modified = true; }
              
              if (modified || !rec.hash) {
                rec.hash = computeHash(rec);
                rec.integrityStatus = 'verified';
              }
            }
            
            data.records = uniqueRecords;
            fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2), 'utf-8');
          }
        } catch (e: any) {
          return { success: false, error: `Chronology repair failed: ${e.message}` };
        }
      }
      return { success: true };
    }

    if (checkId === 'rc-references') {
      const candidatesPath = path.join(govDir, 'release_candidates.json');
      if (fs.existsSync(candidatesPath)) {
        fs.copyFileSync(candidatesPath, `${candidatesPath}.bak-${timestamp}`);
        try {
          const content = fs.readFileSync(candidatesPath, 'utf-8');
          const list = JSON.parse(content);
          if (Array.isArray(list)) {
            const runsPath = path.join(evalsDir, 'regression_runs.json');
            let runs: any[] = [];
            if (fs.existsSync(runsPath)) {
              try { runs = JSON.parse(fs.readFileSync(runsPath, 'utf-8')); } catch (e) {}
            }
            
            let timelineEventIds: string[] = [];
            if (fs.existsSync(timelineDir)) {
              const files = fs.readdirSync(timelineDir);
              for (const file of files) {
                if (file.endsWith('.json')) {
                  const match = file.match(/^event-(.+)\.json$/);
                  if (match) timelineEventIds.push(match[1]);
                }
              }
            }
            
            const repairedList = list.map((rc: any) => {
              const runExists = rc.runId ? runs.some((r: any) => r.id === rc.runId) : true;
              const timelineExists = rc.timelineEventId ? timelineEventIds.includes(rc.timelineEventId) : true;
              
              if (!runExists) rc.runId = null;
              if (!timelineExists) rc.timelineEventId = null;
              
              rc.hash = computeHash(rc);
              rc.integrityStatus = 'verified';
              return rc;
            });
            fs.writeFileSync(candidatesPath, JSON.stringify(repairedList, null, 2), 'utf-8');
          }
        } catch (e: any) {
          return { success: false, error: `RC references repair failed: ${e.message}` };
        }
      }
      return { success: true };
    }

    if (checkId === 'gold-standard-orphans') {
      if (fs.existsSync(goldStandardsDir)) {
        const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
        let benchmarks: any[] = [];
        if (fs.existsSync(benchmarksPath)) {
          try { benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8')); } catch (e) {}
        }
        
        const files = fs.readdirSync(goldStandardsDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(goldStandardsDir, file);
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const gold = JSON.parse(content);
              if (gold.benchmarkId) {
                const benchExists = benchmarks.some((b: any) => b.id === gold.benchmarkId);
                if (!benchExists) {
                  fs.copyFileSync(filePath, `${filePath}.bak-${timestamp}`);
                  fs.unlinkSync(filePath);
                }
              }
            } catch (e) {
              fs.unlinkSync(filePath);
            }
          }
        }
      }
      return { success: true };
    }

    if (checkId === 'empty-malformed-files') {
      const evalFilesToCheck = ['benchmarks.json', 'regression_runs.json', 'judges.json', 'promotions.json'];
      for (const f of evalFilesToCheck) {
        const fPath = path.join(evalsDir, f);
        if (fs.existsSync(fPath)) {
          try {
            const stats = fs.statSync(fPath);
            if (stats.size === 0) throw new Error("Empty file");
            JSON.parse(fs.readFileSync(fPath, 'utf-8'));
          } catch (e) {
            fs.copyFileSync(fPath, `${fPath}.bak-${timestamp}`);
            fs.writeFileSync(fPath, JSON.stringify([], null, 2), 'utf-8');
          }
        }
      }
      
      if (fs.existsSync(timelineDir)) {
        const files = fs.readdirSync(timelineDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const fPath = path.join(timelineDir, file);
            try {
              const stats = fs.statSync(fPath);
              if (stats.size === 0) throw new Error("Empty file");
              JSON.parse(fs.readFileSync(fPath, 'utf-8'));
            } catch (e) {
              fs.copyFileSync(fPath, `${fPath}.bak-${timestamp}`);
              fs.unlinkSync(fPath);
            }
          }
        }
      }
      return { success: true };
    }

    return { success: false, error: `Unknown check ID: ${checkId}` };
  } catch (error: any) {
    console.error('Repair execution crashed:', error);
    return { success: false, error: error.message };
  }
});

// Helper for remediation recording
async function recordRemediationProvenance(rootPath: string | null, presetId: string, record: any) {
  try {
    const provenancePath = getProvenancePath(rootPath, presetId);
    let data: { records: any[] } = { records: [] };
    if (fs.existsSync(provenancePath)) {
      try {
        const content = fs.readFileSync(provenancePath, 'utf-8');
        data = JSON.parse(content);
      } catch (e) {}
    }
    record.hash = computeHash(record);
    record.integrityStatus = 'verified';
    data.records.unshift(record);
    fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to append remediation record to provenance:', e);
  }
}

ipcMain.handle('doctor:export-diagnostic-bundle', async (_event, { rootPath, presetId }) => {
  try {
    const govDir = getGovernanceDir(rootPath, presetId);
    const evalsDir = getEvalsDir(rootPath, presetId);
    const snapshotsDir = getSnapshotsDir(rootPath, presetId);
    const timelineDir = getTimelineDir(rootPath, presetId);

    const report = await runDoctorChecksInternal(rootPath, presetId);

    const bundle: any = {
      schemaVersion: 'agentdeck.diagnostics.v1',
      exportedAt: new Date().toISOString(),
      workspaceId: presetId,
      rootPath,
      doctorReport: report,
      payload: {
        workspaceConfig: null,
        policies: null,
        releaseCandidates: [],
        benchmarks: [],
        regressionRuns: [],
        provenanceRecords: [],
        timelineEvents: [],
        snapshotsCount: 0,
        snapshotsList: []
      }
    };

    // Load Workspace Config
    if (rootPath) {
      const configPath = path.join(rootPath, '.agentdeck', 'workspace.json');
      if (fs.existsSync(configPath)) {
        try { bundle.payload.workspaceConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) {}
      }
    }

    // Load Policies
    const policiesPath = path.join(govDir, 'policies.json');
    if (fs.existsSync(policiesPath)) {
      try { bundle.payload.policies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8')); } catch (e) {}
    }

    // Load Candidates
    const candidatesPath = path.join(govDir, 'release_candidates.json');
    if (fs.existsSync(candidatesPath)) {
      try { bundle.payload.releaseCandidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8')); } catch (e) {}
    }

    // Load Benchmarks
    const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
    if (fs.existsSync(benchmarksPath)) {
      try { bundle.payload.benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8')); } catch (e) {}
    }

    // Load Regression Runs
    const runsPath = path.join(evalsDir, 'regression_runs.json');
    if (fs.existsSync(runsPath)) {
      try { bundle.payload.regressionRuns = JSON.parse(fs.readFileSync(runsPath, 'utf-8')); } catch (e) {}
    }

    // Load Provenance
    const provenancePath = getProvenancePath(rootPath, presetId);
    if (fs.existsSync(provenancePath)) {
      try {
        const prov = JSON.parse(fs.readFileSync(provenancePath, 'utf-8'));
        bundle.payload.provenanceRecords = prov.records || [];
      } catch (e) {}
    }

    // Load Timeline Events
    if (fs.existsSync(timelineDir)) {
      const files = fs.readdirSync(timelineDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const ev = JSON.parse(fs.readFileSync(path.join(timelineDir, file), 'utf-8'));
            bundle.payload.timelineEvents.push(ev);
          } catch (e) {}
        }
      }
    }

    // Load Snapshots Manifests (metadata only)
    if (fs.existsSync(snapshotsDir)) {
      const files = fs.readdirSync(snapshotsDir);
      let count = 0;
      for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('temp_')) {
          count++;
          try {
            const snap = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
            if (snap.manifest) {
              bundle.payload.snapshotsList.push(snap.manifest);
            }
          } catch (e) {}
        }
      }
      bundle.payload.snapshotsCount = count;
    }

    // Prompt user with save dialog
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      return { success: false, error: 'No focused application window found.' };
    }

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Workspace Diagnostics Bundle',
      defaultPath: `agentdeck-diagnostics-${presetId}-${Date.now().toString().slice(-6)}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Export cancelled by user.' };
    }

    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (error: any) {
    console.error('Failed to export diagnostic bundle:', error);
    return { success: false, error: error.message };
  }
});

  return { runDoctorChecksInternal, recordRemediationProvenance };
}
