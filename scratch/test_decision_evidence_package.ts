import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Setup directories
const tempWorkspace = path.join(process.cwd(), 'scratch', 'temp_dep_workspace');
const baseDir = path.join(tempWorkspace, '.agentdeck');
const govDir = path.join(baseDir, 'governance');
const evalsDir = path.join(baseDir, 'evals');
const snapshotsDir = path.join(baseDir, 'snapshots');

function cleanAndInitWorkspace() {
  if (fs.existsSync(tempWorkspace)) {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
  }
  fs.mkdirSync(tempWorkspace, { recursive: true });
  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(govDir, { recursive: true });
  fs.mkdirSync(evalsDir, { recursive: true });
  fs.mkdirSync(snapshotsDir, { recursive: true });
}

function computeHash(obj: any): string {
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

function seedBaselineFiles(options: {
  failedTests: number;
  doctorWarnings: number;
  doctorCriticals: number;
  policyViolated: boolean;
  missingProvenance: boolean;
  missingSnapshots: boolean;
}) {
  // 1. Policies
  const policies = {
    schemaVersion: 'agentdeck.governance.v1',
    minScore: 0.85,
    allowRegression: false,
    requireApproval: true
  };
  fs.writeFileSync(path.join(govDir, 'policies.json'), JSON.stringify(policies, null, 2));

  // 2. Release Candidates
  const score = options.policyViolated ? 0.70 : 0.90; // policy limit is 0.85
  const rc = {
    schemaVersion: 'agentdeck.governance.v1',
    id: 'RC-001',
    version: '1.0.5',
    timestamp: new Date().toISOString(),
    score,
    failuresCount: options.failedTests,
    runId: 'run-123',
    benchmarkId: 'benchmark-123',
    approvedBy: 'Operator',
    status: 'pending',
    baselineScore: 0.82,
    regressionDelta: score - 0.82,
    policyResult: options.policyViolated ? 'failed' : 'requires_approval'
  };
  fs.writeFileSync(path.join(govDir, 'release_candidates.json'), JSON.stringify([rc], null, 2));

  // 3. Evals / Regression Runs
  const run = {
    id: 'run-123',
    benchmarkId: 'benchmark-123',
    timestamp: new Date().toISOString(),
    score,
    baselineScore: 0.82,
    diff: score - 0.82,
    status: options.failedTests > 0 ? 'regression_detected' : 'pass',
    failuresCount: options.failedTests,
    triggerContext: 'Verification Run',
    isApproved: false,
    report: {
      passRate: 100,
      baselineScore: 0.82,
      currentScore: score,
      results: []
    }
  };
  fs.writeFileSync(path.join(evalsDir, 'regression_runs.json'), JSON.stringify([run], null, 2));

  // 4. Provenance
  if (!options.missingProvenance) {
    const provRecord = {
      schemaVersion: 'agentdeck.provenance.v1',
      id: 'prov-1',
      timestamp: Date.now(),
      actor: 'operator',
      mutationType: 'release_candidate_updated',
      sourceType: 'release_candidate',
      sourceId: 'RC-001',
      before: { status: 'pending' },
      after: { status: 'approved' }
    };
    (provRecord as any).hash = computeHash(provRecord);
    
    fs.writeFileSync(path.join(govDir, 'provenance.json'), JSON.stringify({
      records: [provRecord]
    }, null, 2));
  } else {
    // Empty ledger or missing file
    if (fs.existsSync(path.join(govDir, 'provenance.json'))) {
      fs.unlinkSync(path.join(govDir, 'provenance.json'));
    }
  }

  // 5. Snapshots
  if (!options.missingSnapshots) {
    const snap = {
      manifest: {
        schemaVersion: 'agentdeck.snapshot.v1',
        snapshotId: 'snap-123',
        workspaceId: 'temp_dep_workspace',
        description: 'Test pre-release snapshot',
        timestamp: new Date().toISOString()
      },
      payload: {
        governance: {},
        evals: {}
      }
    };
    (snap.manifest as any).hash = computeHash(snap);
    fs.writeFileSync(path.join(snapshotsDir, 'snapshot-snap-123.json'), JSON.stringify(snap, null, 2));
  }

  // 6. Doctor Checks Mock (We will write a mock doctor runner matching the points)
}

// Replicated generate logic from main.ts
function generateDEP(candidateId: string, customDoctorReport: any) {
  const rcPath = path.join(govDir, 'release_candidates.json');
  const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8')).find((c: any) => c.id === candidateId);

  const doctorReport = customDoctorReport;
  const provenancePath = path.join(govDir, 'provenance.json');
  let provenanceList: any[] = [];
  if (fs.existsSync(provenancePath)) {
    provenanceList = JSON.parse(fs.readFileSync(provenancePath, 'utf8')).records || [];
  }

  const policiesPath = path.join(govDir, 'policies.json');
  const policies = JSON.parse(fs.readFileSync(policiesPath, 'utf8'));

  const runPath = path.join(evalsDir, 'regression_runs.json');
  const run = JSON.parse(fs.readFileSync(runPath, 'utf8')).find((r: any) => r.id === rc.runId);

  let associatedSnapshot: any = null;
  if (fs.existsSync(snapshotsDir)) {
    const files = fs.readdirSync(snapshotsDir);
    if (files.length > 0) {
      associatedSnapshot = JSON.parse(fs.readFileSync(path.join(snapshotsDir, files[0]), 'utf8'));
    }
  }

  // Assemble sections
  const layer1 = {
    layerId: 'candidate-summary',
    title: 'Release Candidate Specification',
    description: 'Primary metadata details of the targeted release candidate.',
    content: {
      id: rc.id,
      version: rc.version,
      timestamp: rc.timestamp,
      score: rc.score,
      failuresCount: rc.failuresCount,
      owner: rc.approvedBy || 'Operator',
      status: rc.status
    }
  };

  const layer2 = {
    layerId: 'baseline-comparison',
    title: 'Baseline Comparison Metrics',
    description: 'Compares Release Candidate evaluation score against the active promoted baseline.',
    content: {
      baselineScore: rc.baselineScore || 0.8,
      candidateScore: rc.score,
      regressionDelta: rc.regressionDelta || (rc.score - 0.8),
      policyResult: rc.policyResult || 'requires_approval'
    }
  };

  const layer3 = {
    layerId: 'eval-evidence',
    title: 'Regression Run History details',
    description: 'Detailed evaluation scores, coverage data, and failed test cases.',
    content: {
      runId: rc.runId || 'N/A',
      benchmarkId: rc.benchmarkId,
      score: run ? run.score : rc.score,
      status: run ? run.status : 'pass',
      failuresCount: run ? run.failuresCount : rc.failuresCount
    }
  };

  const policyViolated = rc.score < policies.minScore;
  const layer4 = {
    layerId: 'governance-evidence',
    title: 'Governance Policies Audit',
    description: 'Checks compliance against active governance policy score rules.',
    content: {
      minScore: policies.minScore,
      allowRegression: policies.allowRegression,
      pass: !policyViolated,
      reasons: policyViolated ? ['Evaluation score fell below governance thresholds'] : []
    }
  };

  const layer5 = {
    layerId: 'provenance-chain',
    title: 'Provenance Audit Trail',
    description: 'Timeline of chronological operations leading up to this decision.',
    content: {
      records: provenanceList
    }
  };

  const layer6 = {
    layerId: 'doctor-report',
    title: 'Workspace Diagnostics Audit',
    description: 'Captures the active status and details from the Workspace Doctor.',
    content: {
      status: doctorReport.status,
      checksPassed: doctorReport.checks.filter((c: any) => c.status === 'passed').length,
      checksTotal: doctorReport.checks.length
    }
  };

  const layer7 = {
    layerId: 'snapshot-evidence',
    title: 'Workspace Snapshot Linkage',
    description: 'Identifies the cryptographically signed snapshot of the workspace state.',
    content: {
      snapshotId: associatedSnapshot ? associatedSnapshot.manifest.snapshotId : 'N/A',
      hash: associatedSnapshot ? associatedSnapshot.manifest.hash : 'N/A',
      integrityStatus: associatedSnapshot ? 'verified' : 'unsigned'
    }
  };

  const evidenceArray = [layer1, layer2, layer3, layer4, layer5, layer6, layer7];

  // Freeze & hash
  const sortObject = (o: any): any => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sortObject);
    return Object.keys(o).sort().reduce((acc: any, key: string) => {
      acc[key] = sortObject(o[key]);
      return acc;
    }, {});
  };
  const evidenceSnapshotHash = crypto.createHash('sha256').update(JSON.stringify(sortObject(evidenceArray))).digest('hex');

  // Sufficiency check
  const sufficiencyDetails: string[] = [];
  if (!rc.runId) sufficiencyDetails.push('Missing evaluations regression run link.');
  if (provenanceList.length === 0) sufficiencyDetails.push('Missing provenance causality trail.');
  if (doctorReport.status === 'critical') sufficiencyDetails.push('Workspace diagnostics reported critical vulnerabilities.');
  const evidenceSufficiency = sufficiencyDetails.length === 0 ? 'pass' : 'fail';

  // Deterministic Risk Engine
  let riskPoints = 0;
  const breakdown: Record<string, number> = {};

  const failedCount = run ? run.failuresCount : rc.failuresCount;
  if (failedCount > 0) {
    const p = failedCount * 20;
    riskPoints += p;
    breakdown[`Failed Test Cases (${failedCount})`] = p;
  }

  const doctorWarnings = doctorReport.checks.filter((c: any) => c.status === 'warning').length;
  if (doctorWarnings > 0) {
    const p = doctorWarnings * 10;
    riskPoints += p;
    breakdown[`Doctor Warnings (${doctorWarnings})`] = p;
  }

  const doctorCriticals = doctorReport.checks.filter((c: any) => c.status === 'failed').length;
  if (doctorCriticals > 0) {
    const p = doctorCriticals * 50;
    riskPoints += p;
    breakdown[`Doctor Criticals (${doctorCriticals})`] = p;
  }

  if (policyViolated) {
    riskPoints += 30;
    breakdown['Policy Threshold Violations'] = 30;
  }

  if (provenanceList.length === 0) {
    riskPoints += 40;
    breakdown['Missing Provenance Records Ledger'] = 40;
  }

  let riskLevel = 'LOW';
  if (riskPoints > 80) riskLevel = 'CRITICAL';
  else if (riskPoints > 50) riskLevel = 'HIGH';
  else if (riskPoints > 20) riskLevel = 'MEDIUM';

  const layer8 = {
    layerId: 'risk-assessment',
    title: 'Risk Assessment Severity Score',
    description: 'Scores risk levels deterministically based on files, tests, and policies.',
    content: { riskPoints, riskLevel, breakdown }
  };
  evidenceArray.push(layer8);

  const depId = `DEP-2026-RC001`;

  const dep: any = {
    schemaVersion: 'agentdeck.dep.v1',
    id: depId,
    timestamp: new Date().toISOString(),
    workspaceId: 'temp_dep_workspace',
    decisionClass: 'routine',
    decisionType: 'approve',
    releaseCandidateId: candidateId,
    evidenceSnapshotHash,
    evidenceSufficiency,
    evidenceSufficiencyDetails: sufficiencyDetails,
    decisionSummary: 'System Generated Preview',
    decisionRationale: '',
    recommendation: {
      decision: riskLevel === 'CRITICAL' ? 'REJECT' : 'APPROVE',
      confidence: 90,
      boardRecommendation: riskLevel === 'CRITICAL' ? 'REJECT' : 'APPROVE'
    },
    finalDecision: 'approve',
    generatedBy: 'System Engine',
    generatedAt: new Date().toISOString(),
    evidence: evidenceArray,
    signatures: []
  };

  return dep;
}

// Replicated sign & save logic from main.ts
function signAndSaveDEP(dep: any, rationale: string, decisionClass: any) {
  dep.decisionRationale = rationale;
  dep.decisionClass = decisionClass;
  dep.approvedBy = 'Release Board';
  dep.approvedAt = new Date().toISOString();

  const sigTimestamp = new Date().toISOString();
  const sigPayload = {
    authority: 'Release Board',
    rationale,
    timestamp: sigTimestamp,
    evidenceHash: dep.evidenceSnapshotHash
  };
  const sigHash = crypto.createHash('sha256').update(JSON.stringify(sigPayload)).digest('hex');

  const signature = {
    authority: 'Release Board',
    timestamp: sigTimestamp,
    hash: sigHash
  };
  dep.signatures = [signature];

  // Set signatures layer
  const sigLayer = dep.evidence.find((l: any) => l.layerId === 'signatures') || {
    layerId: 'signatures',
    title: 'Authorized Decision Board Signatures',
    description: 'Cryptographic seals appended by authorized stakeholders.',
    content: {}
  };
  sigLayer.content.signatures = [signature];
  if (!dep.evidence.some((l: any) => l.layerId === 'signatures')) {
    dep.evidence.push(sigLayer);
  }

  // Calculate package hash
  dep.hash = computeHash(dep);
  dep.integrityStatus = 'verified';

  // Save to Decisions path
  const decisionsDir = path.join(govDir, 'decisions');
  const depFolder = path.join(decisionsDir, `dep-${dep.id}`);
  fs.mkdirSync(depFolder, { recursive: true });

  const evidenceFolder = path.join(depFolder, 'evidence');
  fs.mkdirSync(evidenceFolder, { recursive: true });

  // Save dep.json and dep.md
  fs.writeFileSync(path.join(depFolder, 'dep.json'), JSON.stringify(dep, null, 2), 'utf-8');
  
  // Save evidence section sub-files
  const docRep = dep.evidence.find((l: any) => l.layerId === 'doctor-report')?.content || {};
  const prov = dep.evidence.find((l: any) => l.layerId === 'provenance-chain')?.content || {};
  const snap = dep.evidence.find((l: any) => l.layerId === 'snapshot-evidence')?.content || {};
  const evals = dep.evidence.find((l: any) => l.layerId === 'eval-evidence')?.content || {};

  fs.writeFileSync(path.join(evidenceFolder, 'doctor-report.json'), JSON.stringify(docRep, null, 2), 'utf-8');
  fs.writeFileSync(path.join(evidenceFolder, 'provenance.json'), JSON.stringify(prov, null, 2), 'utf-8');
  fs.writeFileSync(path.join(evidenceFolder, 'snapshot.json'), JSON.stringify(snap, null, 2), 'utf-8');
  fs.writeFileSync(path.join(evidenceFolder, 'evaluations.json'), JSON.stringify(evals, null, 2), 'utf-8');

  // Verify that the files exist
  console.log(`Saved package dep.json to: ${path.join(depFolder, 'dep.json')}`);
  console.log(`Saved frozen doctor-report.json to: ${path.join(evidenceFolder, 'doctor-report.json')}`);
}

async function runTests() {
  console.log('=== DECISION EVIDENCE PACKAGE GOVERNANCE UNIT TESTS ===');

  // --- Test Case 1: LOW RISK, PASS SUFFICIENCY ---
  console.log('\n--- Test 1: Low Risk and Passing Sufficiency ---');
  cleanAndInitWorkspace();
  seedBaselineFiles({
    failedTests: 0,
    doctorWarnings: 0,
    doctorCriticals: 0,
    policyViolated: false,
    missingProvenance: false,
    missingSnapshots: false
  });

  const doctorReportLow = {
    status: 'healthy',
    checks: [
      { id: 'folders', status: 'passed' },
      { id: 'schema', status: 'passed' }
    ]
  };

  const dep1 = generateDEP('RC-001', doctorReportLow);
  console.log('Risk score points:', dep1.evidence.find((e: any) => e.layerId === 'risk-assessment').content.riskPoints);
  console.log('Risk level:', dep1.evidence.find((e: any) => e.layerId === 'risk-assessment').content.riskLevel);
  console.log('Evidence Sufficiency:', dep1.evidenceSufficiency);

  if (dep1.evidence.find((e: any) => e.layerId === 'risk-assessment').content.riskPoints !== 0) {
    throw new Error('Test 1 failed: Risk score should be 0.');
  }
  if (dep1.evidenceSufficiency !== 'pass') {
    throw new Error('Test 1 failed: Sufficiency should be PASS.');
  }

  // --- Test Case 2: CRITICAL RISK, FAIL SUFFICIENCY (FAILED TESTS & CRITICAL DOCTOR CHECKS & MISSING PROVENANCE & POLICY VIOLATION) ---
  console.log('\n--- Test 2: Rule-Based Risk Engine Points Audit & Sufficiency Failures ---');
  cleanAndInitWorkspace();
  seedBaselineFiles({
    failedTests: 2, // 2 failed tests = 40 points
    doctorWarnings: 1, // 1 warning = 10 points
    doctorCriticals: 1, // 1 critical = 50 points
    policyViolated: true, // 1 policy violation = 30 points
    missingProvenance: true, // missing provenance = 40 points
    missingSnapshots: false
  });

  const doctorReportCrit = {
    status: 'critical',
    checks: [
      { id: 'folders', status: 'failed' }, // critical
      { id: 'schema', status: 'warning' } // warning
    ]
  };

  const dep2 = generateDEP('RC-001', doctorReportCrit);
  const assessment = dep2.evidence.find((e: any) => e.layerId === 'risk-assessment').content;
  console.log('Expected points: 2 * 20 (failed tests) + 1 * 10 (warnings) + 1 * 50 (critical) + 30 (policy) + 40 (missing provenance) = 170');
  console.log('Computed points:', assessment.riskPoints);
  console.log('Computed severity:', assessment.riskLevel);
  console.log('Sufficiency status:', dep2.evidenceSufficiency);
  console.log('Sufficiency issues:', dep2.evidenceSufficiencyDetails);

  if (assessment.riskPoints !== 170) {
    throw new Error(`Test 2 failed: Risk score should be 170, but got ${assessment.riskPoints}`);
  }
  if (assessment.riskLevel !== 'CRITICAL') {
    throw new Error('Test 2 failed: Risk level should be CRITICAL.');
  }
  if (dep2.evidenceSufficiency !== 'fail') {
    throw new Error('Test 2 failed: Sufficiency should be FAIL.');
  }

  // --- Test Case 3: Sign, Save & Package Archive Structure Check ---
  console.log('\n--- Test 3: Sign, Save & Self-Contained Archive Verification ---');
  signAndSaveDEP(dep2, 'Approved despite warnings because this is a diagnostic staging test.', 'critical');

  const decisionsDir = path.join(govDir, 'decisions');
  const depFolder = path.join(decisionsDir, `dep-${dep2.id}`);
  const evidenceFolder = path.join(depFolder, 'evidence');

  if (!fs.existsSync(path.join(depFolder, 'dep.json'))) {
    throw new Error('Test 3 failed: dep.json is missing.');
  }
  if (!fs.existsSync(path.join(evidenceFolder, 'doctor-report.json'))) {
    throw new Error('Test 3 failed: doctor-report.json evidence file is missing.');
  }
  if (!fs.existsSync(path.join(evidenceFolder, 'provenance.json'))) {
    throw new Error('Test 3 failed: provenance.json evidence file is missing.');
  }
  if (!fs.existsSync(path.join(evidenceFolder, 'snapshot.json'))) {
    throw new Error('Test 3 failed: snapshot.json evidence file is missing.');
  }
  if (!fs.existsSync(path.join(evidenceFolder, 'evaluations.json'))) {
    throw new Error('Test 3 failed: evaluations.json evidence file is missing.');
  }

  const loadedJson = JSON.parse(fs.readFileSync(path.join(depFolder, 'dep.json'), 'utf8'));
  console.log('Loaded DEP Rationale:', loadedJson.decisionRationale);
  console.log('Loaded DEP Decision Class:', loadedJson.decisionClass);
  console.log('Loaded DEP Signatures:', loadedJson.signatures.length);

  if (loadedJson.decisionRationale !== 'Approved despite warnings because this is a diagnostic staging test.') {
    throw new Error('Test 3 failed: Rationale did not persist correctly.');
  }
  if (loadedJson.decisionClass !== 'critical') {
    throw new Error('Test 3 failed: Decision Class did not persist correctly.');
  }
  if (loadedJson.signatures.length !== 1) {
    throw new Error('Test 3 failed: Signature count is incorrect.');
  }

  // Cleanup temp files
  fs.rmSync(tempWorkspace, { recursive: true, force: true });
  console.log('\nAll Decision Evidence Package unit tests completed successfully!');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
