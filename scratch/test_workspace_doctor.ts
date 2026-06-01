import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Replicate verifyHash and computeHash for verification inside test
function computeHash(obj: any): string {
  if (obj === null || obj === undefined) return '';
  
  const sortObject = (o: any): any => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sortObject);
    return Object.keys(o).sort().reduce((acc: any, key: string) => {
      if (key === 'hash' || key === 'integrityStatus' || key === 'tampered') {
        return acc;
      }
      acc[key] = sortObject(o[key]);
      return acc;
    }, {});
  };
  
  const serialized = JSON.stringify(sortObject(obj));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function verifyHash(obj: any): 'verified' | 'unsigned' | 'tampered' {
  if (!obj || typeof obj !== 'object') return 'unsigned';
  
  const hash = obj.hash || (obj.manifest && obj.manifest.hash);
  if (!hash) return 'unsigned';
  
  const recomputed = computeHash(obj);
  return hash === recomputed ? 'verified' : 'tampered';
}

// Check function matching electron backend main.ts logic
function runDoctorChecksForTest(rootPath: string): any {
  const checks: any[] = [];
  const baseDir = path.join(rootPath, '.agentdeck');
  const baseExists = fs.existsSync(baseDir);
  
  // 1. Folders exist check
  const missingDirs: string[] = [];
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
  
  checks.push({
    id: 'folders-exist',
    name: 'Workspace Directories Existence',
    status: missingDirs.length > 0 ? 'failed' : 'passed',
    message: missingDirs.length > 0 ? `Missing folders: ${missingDirs.join(', ')}` : 'All workspace subdirectories exist.',
    repairable: true
  });
  
  // 2. Governance schema check
  const govCheck = {
    id: 'governance-schema',
    name: 'Governance Schema Validity',
    status: 'passed',
    message: 'Governance files are schema compliant.',
    repairable: true
  };
  
  const govDir = path.join(baseDir, 'governance');
  const policiesPath = path.join(govDir, 'policies.json');
  const candidatesPath = path.join(govDir, 'release_candidates.json');
  let candidatesList: any[] = [];
  
  if (fs.existsSync(policiesPath)) {
    try {
      const content = fs.readFileSync(policiesPath, 'utf-8');
      const policies = JSON.parse(content);
      if (policies.schemaVersion !== 'agentdeck.governance.v1') {
        govCheck.status = 'failed';
        govCheck.message = 'policies.json invalid schema';
      }
    } catch (e) {
      govCheck.status = 'failed';
      govCheck.message = 'Malformed policies.json';
    }
  }
  
  if (fs.existsSync(candidatesPath) && govCheck.status === 'passed') {
    try {
      const content = fs.readFileSync(candidatesPath, 'utf-8');
      candidatesList = JSON.parse(content);
      for (const rc of candidatesList) {
        if (rc.schemaVersion !== 'agentdeck.governance.v1') {
          govCheck.status = 'failed';
          govCheck.message = 'RC schema invalid';
          break;
        }
        if (verifyHash(rc) === 'tampered') {
          govCheck.status = 'failed';
          govCheck.message = `Release candidate ${rc.id} tampered.`;
          break;
        }
      }
    } catch (e) {
      govCheck.status = 'failed';
      govCheck.message = 'Malformed release_candidates.json';
    }
  }
  checks.push(govCheck);

  // 3. Broken snapshot manifests check
  const snapshotsCheck = {
    id: 'snapshots-integrity',
    name: 'Snapshot Manifest Verification',
    status: 'passed',
    message: 'All snapshots are verified.',
    repairable: true
  };
  
  const snapshotsDir = path.join(baseDir, 'snapshots');
  const tamperedSnaps: string[] = [];
  const unsignedSnaps: string[] = [];
  
  if (fs.existsSync(snapshotsDir)) {
    const files = fs.readdirSync(snapshotsDir);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('temp_') && !file.includes('.compromised') && !file.includes('.bak')) {
        try {
          const snap = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
          if (snap.manifest) {
            const integrity = verifyHash(snap);
            if (integrity === 'tampered') tamperedSnaps.push(snap.manifest.snapshotId || file);
            else if (integrity === 'unsigned') unsignedSnaps.push(snap.manifest.snapshotId || file);
          }
        } catch (e) {
          tamperedSnaps.push(file);
        }
      }
    }
  }
  
  if (tamperedSnaps.length > 0) {
    snapshotsCheck.status = 'failed';
    snapshotsCheck.message = `Tampered snapshots: ${tamperedSnaps.join(', ')}`;
  } else if (unsignedSnaps.length > 0) {
    snapshotsCheck.status = 'warning';
    snapshotsCheck.message = `Unsigned snapshots: ${unsignedSnaps.join(', ')}`;
  }
  checks.push(snapshotsCheck);

  // 4. Tampered provenance records check
  const provenanceCheck = {
    id: 'provenance-tamper',
    name: 'Provenance Cryptographic Seals',
    status: 'passed',
    message: 'Provenance ledger is intact.',
    repairable: true
  };
  
  const provenancePath = path.join(govDir, 'provenance.json');
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
          if (integrity === 'tampered') tamperedProvIds.push(rec.id);
          else if (integrity === 'unsigned') unsignedProvIds.push(rec.id);
        }
      }
    } catch (e) {
      provenanceCheck.status = 'failed';
      provenanceCheck.message = 'Malformed provenance.json';
    }
  }
  
  if (tamperedProvIds.length > 0) {
    provenanceCheck.status = 'failed';
    provenanceCheck.message = `Tampered provenance: ${tamperedProvIds.join(', ')}`;
  } else if (unsignedProvIds.length > 0) {
    provenanceCheck.status = 'warning';
    provenanceCheck.message = `Unsigned provenance: ${unsignedProvIds.join(', ')}`;
  }
  checks.push(provenanceCheck);

  // 5. Provenance Chronology Check
  const chronologyCheck = {
    id: 'provenance-chronology',
    name: 'Provenance Chronology',
    status: 'passed',
    message: 'Chronology valid.',
    repairable: true
  };
  
  if (provenanceCheck.status !== 'failed' && fs.existsSync(provenancePath)) {
    const records = provenanceData.records;
    const seenIds = new Set<string>();
    let ordered = true;
    let duplicateIds: string[] = [];
    let schemaIncomplete = false;
    
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.id) {
        if (seenIds.has(rec.id)) duplicateIds.push(rec.id);
        seenIds.add(rec.id);
      }
      if (!rec.sourceType || !rec.mutationType || rec.before === undefined || rec.after === undefined) {
        schemaIncomplete = true;
      }
      if (i > 0) {
        const prev = records[i - 1];
        if (prev.timestamp < rec.timestamp) ordered = false;
      }
    }
    
    if (duplicateIds.length > 0 || schemaIncomplete || !ordered) {
      chronologyCheck.status = 'failed';
      chronologyCheck.message = `Duplicates: ${duplicateIds.length}, Ordered: ${ordered}, Incomplete: ${schemaIncomplete}`;
    }
  }
  checks.push(chronologyCheck);

  // 6. Gold standard orphans check
  const goldOrphanCheck = {
    id: 'gold-standard-orphans',
    name: 'Gold Standard Orphans',
    status: 'passed',
    message: 'Gold standards healthy.',
    repairable: true
  };
  
  const evalsDir = path.join(baseDir, 'evals');
  const goldStandardsDir = path.join(evalsDir, 'gold-standards');
  if (fs.existsSync(goldStandardsDir)) {
    const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
    let benchmarks: any[] = [];
    if (fs.existsSync(benchmarksPath)) {
      try { benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8')); } catch (e) {}
    }
    
    const orphanedGolds: string[] = [];
    const files = fs.readdirSync(goldStandardsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const gold = JSON.parse(fs.readFileSync(path.join(goldStandardsDir, file), 'utf-8'));
          if (gold.benchmarkId) {
            const benchExists = benchmarks.some((b: any) => b.id === gold.benchmarkId);
            if (!benchExists) orphanedGolds.push(gold.id);
          }
        } catch (e) {
          orphanedGolds.push(file);
        }
      }
    }
    if (orphanedGolds.length > 0) {
      goldOrphanCheck.status = 'warning';
      goldOrphanCheck.message = `Orphans: ${orphanedGolds.join(', ')}`;
    }
  }
  checks.push(goldOrphanCheck);

  // 7. Malformed files check
  const emptyCheck = {
    id: 'empty-malformed-files',
    name: 'Syntax Health',
    status: 'passed',
    message: 'All files uncorrupted.',
    repairable: true
  };
  let malformedCount = 0;
  if (fs.existsSync(evalsDir)) {
    const evalFiles = ['benchmarks.json', 'regression_runs.json', 'judges.json', 'promotions.json'];
    for (const f of evalFiles) {
      const fPath = path.join(evalsDir, f);
      if (fs.existsSync(fPath)) {
        try {
          const stats = fs.statSync(fPath);
          if (stats.size === 0) throw new Error();
          JSON.parse(fs.readFileSync(fPath, 'utf-8'));
        } catch (e) {
          malformedCount++;
        }
      }
    }
  }
  if (malformedCount > 0) {
    emptyCheck.status = 'failed';
    emptyCheck.message = `Malformed count: ${malformedCount}`;
  }
  checks.push(emptyCheck);

  let overallStatus = 'healthy';
  const hasFailed = checks.some(c => c.status === 'failed');
  const hasWarning = checks.some(c => c.status === 'warning');
  if (hasFailed) overallStatus = 'critical';
  else if (hasWarning) overallStatus = 'warning';
  
  return {
    status: overallStatus,
    checks
  };
}

// Replicate repair logic headlessly for validation
function repairDoctorCheckForTest(rootPath: string, checkId: string): boolean {
  const baseDir = path.join(rootPath, '.agentdeck');
  const govDir = path.join(baseDir, 'governance');
  const evalsDir = path.join(baseDir, 'evals');
  const snapshotsDir = path.join(baseDir, 'snapshots');
  const goldStandardsDir = path.join(evalsDir, 'gold-standards');
  const timestamp = Date.now();

  if (checkId === 'folders-exist') {
    const subdirs = ['evals', 'timeline', 'governance', 'snapshots'];
    for (const sub of subdirs) {
      fs.mkdirSync(path.join(baseDir, sub), { recursive: true });
    }
    return true;
  }

  if (checkId === 'governance-schema') {
    // Quarantine tampered and seed default policy
    const policiesPath = path.join(govDir, 'policies.json');
    if (fs.existsSync(policiesPath)) {
      fs.copyFileSync(policiesPath, `${policiesPath}.bak-${timestamp}`);
    }
    const defaultPolicies = {
      schemaVersion: 'agentdeck.governance.v1',
      minScore: 0.85,
      allowRegression: false,
      requireApproval: true
    };
    (defaultPolicies as any).hash = computeHash(defaultPolicies);
    fs.writeFileSync(policiesPath, JSON.stringify(defaultPolicies, null, 2));
    return true;
  }

  if (checkId === 'snapshots-integrity') {
    if (fs.existsSync(snapshotsDir)) {
      const files = fs.readdirSync(snapshotsDir);
      for (const file of files) {
        if (file.endsWith('.json') && !file.includes('.compromised') && !file.includes('.bak')) {
          const filePath = path.join(snapshotsDir, file);
          try {
            const snap = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const integrity = verifyHash(snap);
            if (integrity === 'unsigned') {
              snap.manifest.hash = computeHash(snap);
              fs.writeFileSync(filePath, JSON.stringify(snap, null, 2));
            } else if (integrity === 'tampered') {
              // Quarantine!
              fs.copyFileSync(filePath, `${filePath}.bak-${timestamp}`);
              fs.renameSync(filePath, `${filePath}.compromised`);
              
              // Append remediation record in provenance
              appendRemediationRecord(govDir, {
                schemaVersion: 'agentdeck.provenance.v1',
                id: `prov-remed-${Date.now()}`,
                timestamp: Date.now(),
                actor: 'system',
                mutationType: 'snapshot_restored',
                sourceType: 'snapshot',
                sourceId: snap.manifest.snapshotId,
                before: { status: 'tampered' },
                after: { status: 'quarantined', file }
              });
            }
          } catch (e) {
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
        const hasTampered = data.records.some((r: any) => verifyHash(r) === 'tampered');
        if (hasTampered) {
          // Quarantine provenance
          fs.copyFileSync(provenancePath, `${provenancePath}.bak-${timestamp}`);
          fs.renameSync(provenancePath, `${provenancePath}.compromised`);
          
          // Seed new ledger with remediation record
          const cleanLedger = { records: [] as any[] };
          const remediation = {
            schemaVersion: "agentdeck.provenance.v1",
            id: `prov-remed-${Date.now()}`,
            timestamp: Date.now(),
            actor: "system",
            mutationType: "policy_updated",
            sourceType: "policy",
            sourceId: "provenance-ledger",
            before: { status: "tampered_archived" },
            after: { status: "reinitialized_clean" }
          };
          (remediation as any).hash = computeHash(remediation);
          cleanLedger.records.push(remediation);
          fs.writeFileSync(provenancePath, JSON.stringify(cleanLedger, null, 2));
        } else {
          // Seal unsigned
          for (const rec of data.records) {
            if (!rec.hash) {
              rec.hash = computeHash(rec);
            }
          }
          fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2));
        }
      } catch (e) {
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
        const seen = new Set();
        const uniques = data.records.filter((r: any) => {
          if (!r.id || seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        uniques.sort((a: any, b: any) => b.timestamp - a.timestamp);
        data.records = uniques;
        fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2));
      } catch (e) {}
    }
    return true;
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
            const gold = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (gold.benchmarkId) {
              const exists = benchmarks.some((b: any) => b.id === gold.benchmarkId);
              if (!exists) fs.unlinkSync(filePath);
            }
          } catch (e) {
            fs.unlinkSync(filePath);
          }
        }
      }
    }
    return true;
  }

  if (checkId === 'empty-malformed-files') {
    const files = ['benchmarks.json', 'regression_runs.json', 'judges.json', 'promotions.json'];
    for (const f of files) {
      const fPath = path.join(evalsDir, f);
      if (fs.existsSync(fPath)) {
        try {
          JSON.parse(fs.readFileSync(fPath, 'utf-8'));
        } catch (e) {
          fs.writeFileSync(fPath, JSON.stringify([], null, 2));
        }
      }
    }
    return true;
  }

  return false;
}

function appendRemediationRecord(govDir: string, record: any) {
  const pPath = path.join(govDir, 'provenance.json');
  let data = { records: [] as any[] };
  if (fs.existsSync(pPath)) {
    try { data = JSON.parse(fs.readFileSync(pPath, 'utf-8')); } catch (e) {}
  }
  record.hash = computeHash(record);
  data.records.unshift(record);
  fs.writeFileSync(pPath, JSON.stringify(data, null, 2));
}

// Headless test suite
async function main() {
  console.log('=== Headless Workspace Repair & Quarantine Validation ===');
  
  const tempWorkspace = path.join(process.cwd(), 'scratch', 'temp_doctor_workspace');
  if (fs.existsSync(tempWorkspace)) {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
  }
  fs.mkdirSync(tempWorkspace, { recursive: true });

  const baseDir = path.join(tempWorkspace, '.agentdeck');

  // --- Test Case A: Folders Missing & Repair ---
  console.log('\n--- Test A: Folders Missing & Recreate ---');
  let report = runDoctorChecksForTest(tempWorkspace);
  console.log('Overall report:', report.status);
  console.log('Folders Check status:', report.checks.find((c: any) => c.id === 'folders-exist').status);
  
  // Repair
  repairDoctorCheckForTest(tempWorkspace, 'folders-exist');
  report = runDoctorChecksForTest(tempWorkspace);
  console.log('After Repair - Folders Check status:', report.checks.find((c: any) => c.id === 'folders-exist').status);
  if (report.checks.find((c: any) => c.id === 'folders-exist').status !== 'passed') {
    throw new Error('Test A failed: Recreate folders did not resolve folders check.');
  }

  // Seeding clean baseline files
  fs.writeFileSync(path.join(baseDir, 'evals', 'benchmarks.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(baseDir, 'evals', 'regression_runs.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(baseDir, 'evals', 'judges.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(baseDir, 'evals', 'promotions.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(baseDir, 'governance', 'policies.json'), JSON.stringify({ schemaVersion: 'agentdeck.governance.v1', minScore: 0.85 }, null, 2));
  fs.writeFileSync(path.join(baseDir, 'governance', 'release_candidates.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(baseDir, 'governance', 'provenance.json'), JSON.stringify({ records: [] }, null, 2));

  // --- Test Case B: Unsigned Snapshots Seal ---
  console.log('\n--- Test B: Unsigned Snapshot Seal ---');
  const snapPath = path.join(baseDir, 'snapshots', 'snapshot-test.json');
  fs.writeFileSync(snapPath, JSON.stringify({ manifest: { schemaVersion: 'agentdeck.snapshot.v1', snapshotId: 'test-snap', description: 'unsigned test' }, payload: {} }, null, 2));
  
  report = runDoctorChecksForTest(tempWorkspace);
  console.log('Initial Snapshot status:', report.checks.find((c: any) => c.id === 'snapshots-integrity').status);
  
  // Repair (Seal)
  repairDoctorCheckForTest(tempWorkspace, 'snapshots-integrity');
  report = runDoctorChecksForTest(tempWorkspace);
  console.log('After Seal - Snapshot status:', report.checks.find((c: any) => c.id === 'snapshots-integrity').status);
  const snapContent = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
  console.log('Sealed snapshot hash:', snapContent.manifest.hash);
  if (!snapContent.manifest.hash || report.checks.find((c: any) => c.id === 'snapshots-integrity').status !== 'passed') {
    throw new Error('Test B failed: Snapshot was not signed properly.');
  }

  // --- Test Case C: Tampered Snapshot Quarantine ---
  console.log('\n--- Test C: Tampered Snapshot Quarantine (Quarantine / Evidence Preservation) ---');
  snapContent.payload = { modifiedData: 'corrupted state' }; // tamper payload
  fs.writeFileSync(snapPath, JSON.stringify(snapContent, null, 2));

  report = runDoctorChecksForTest(tempWorkspace);
  console.log('Initial status with tampered snapshot:', report.checks.find((c: any) => c.id === 'snapshots-integrity').status);
  if (report.checks.find((c: any) => c.id === 'snapshots-integrity').status !== 'failed') {
    throw new Error('Test C failed: Tampered snapshot was not detected.');
  }

  // Repair (Remediate / Quarantine)
  repairDoctorCheckForTest(tempWorkspace, 'snapshots-integrity');
  
  // Verify quarantine: File renamed to .compromised, backup created
  const compromisedExists = fs.existsSync(`${snapPath}.compromised`);
  const originalExists = fs.existsSync(snapPath);
  console.log('Quarantined file exists (.compromised):', compromisedExists);
  console.log('Original file still exists (should be moved):', originalExists);
  
  report = runDoctorChecksForTest(tempWorkspace);
  console.log('After Quarantine - Snapshot status:', report.checks.find((c: any) => c.id === 'snapshots-integrity').status);
  
  // Verify remediation record in provenance
  const provPath = path.join(baseDir, 'governance', 'provenance.json');
  const provContent = JSON.parse(fs.readFileSync(provPath, 'utf-8'));
  console.log('Remediation records appended:', provContent.records.length);
  console.log('Latest record:', provContent.records[0].after.message);

  if (!compromisedExists || originalExists || report.checks.find((c: any) => c.id === 'snapshots-integrity').status !== 'passed') {
    throw new Error('Test C failed: Tampered snapshot quarantine did not successfully move files or fix state.');
  }

  // --- Test Case D: Tampered Provenance Quarantine ---
  console.log('\n--- Test D: Tampered Provenance Quarantine ---');
  // Mutate latest record to tamper it
  provContent.records[0].after.message = 'compromised modification';
  fs.writeFileSync(provPath, JSON.stringify(provContent, null, 2));

  report = runDoctorChecksForTest(tempWorkspace);
  console.log('Provenance status (tampered):', report.checks.find((c: any) => c.id === 'provenance-tamper').status);
  if (report.checks.find((c: any) => c.id === 'provenance-tamper').status !== 'failed') {
    throw new Error('Test D failed: Tampered provenance record was not flagged.');
  }

  // Repair (Quarantine whole ledger & re-seed)
  repairDoctorCheckForTest(tempWorkspace, 'provenance-tamper');
  report = runDoctorChecksForTest(tempWorkspace);
  console.log('After Quarantine - Provenance status:', report.checks.find((c: any) => c.id === 'provenance-tamper').status);
  
  const freshProvContent = JSON.parse(fs.readFileSync(provPath, 'utf-8'));
  console.log('Re-seeded ledger length:', freshProvContent.records.length);
  console.log('Re-seeded record message:', freshProvContent.records[0].after.message);
  
  if (report.checks.find((c: any) => c.id === 'provenance-tamper').status !== 'passed') {
    throw new Error('Test D failed: Provenance quarantine did not reset ledger status.');
  }

  // Cleanup temp files
  fs.rmSync(tempWorkspace, { recursive: true, force: true });
  console.log('\nAll Repair & Quarantine tests completed successfully!');
}

main().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
