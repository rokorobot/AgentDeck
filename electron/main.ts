import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { TerminalManager } from './terminalManager';
import { approveCommand } from './commandSafety';
import { processManager } from './processManager';
import { spawn } from 'child_process';
import { setLogWindow, addSystemLogInternal } from './logger';
import { validateManifest } from '../src/lib/manifestValidation';
import { scanAgentTopologyInternal } from '../src/lib/topologyScanner';
import { isWorkspaceRootSafe, assertSafeId } from '../src/lib/pathSafety';
import { createWorkspacePaths } from './workspacePaths';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';
import { registerProcessHandlers } from './ipc/processHandlers';
import { registerTerminalHandlers } from './ipc/terminalHandlers';
import { registerIdeHandlers } from './ipc/ideHandlers';
import { registerSystemHandlers } from './ipc/systemHandlers';
import { registerProvenanceHandlers } from './ipc/provenanceHandlers';
import { registerGovernanceHandlers } from './ipc/governanceHandlers';
import { registerTimelineHandlers } from './ipc/timelineHandlers';
import { registerEvalsHandlers } from './ipc/evalsHandlers';
import { registerSnapshotsHandlers } from './ipc/snapshotsHandlers';
import { registerDoctorHandlers } from './ipc/doctorHandlers';

let mainWindow: BrowserWindow | null = null;
const terminalManager = new TerminalManager();

const WORKSPACES_DIR = path.join(process.cwd(), 'workspaces');
const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure directories exist
if (!fs.existsSync(WORKSPACES_DIR)) {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Workspace path resolvers (extracted to workspacePaths.ts, W5 PR 5). Bound to
// DATA_DIR here so every existing call site (getEvalsDir(rootPath, presetId),
// etc.) stays unchanged.
const {
  getEvalsDir,
  getTimelineDir,
  getGovernanceDir,
  getSnapshotsDir,
  getDecisionsDir,
  getProvenancePath,
} = createWorkspacePaths(DATA_DIR);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0B0F14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
  });

  terminalManager.init(mainWindow);
  setLogWindow(mainWindow);


  // In development, load from Vite local server.
  // In production, load the built index.html from dist folder.
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  terminalManager.killAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler Registrations

// --- System / Misc (extracted to ipc/systemHandlers.ts, W5 PR 4) ---
// Thin, self-contained handlers: workspaces:load-all/load, layout:load/save,
// logs:load/save/add, ollama:check-status, dialog:open-directory,
// port:check-health. The heavier singular `workspace:*` domain stays in main.ts.
registerSystemHandlers({
  ipcMain,
  dialog,
  BrowserWindow,
  getMainWindow: () => mainWindow,
  workspacesDir: WORKSPACES_DIR,
  dataDir: DATA_DIR,
  addSystemLogInternal,
});

// --- Safety Approval Gate ---
ipcMain.handle('safety:approve', async (_event, command: string) => {
  approveCommand(command);
  return true;
});

// --- Terminals (extracted to ipc/terminalHandlers.ts, W5 PR 2) ---
registerTerminalHandlers({ ipcMain, terminalManager });

// --- Dynamic Workspace Loader (.agentdeck/workspace.json) ---
ipcMain.handle('workspace:load-path', async (_event, folderPath: string) => {
  try {
    if (!isWorkspaceRootSafe(folderPath)) return null;
    const configPath = path.join(folderPath, '.agentdeck', 'workspace.json');
    if (!fs.existsSync(configPath)) {
      return null;
    } else {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);
      config.rootPath = folderPath;
      return config;
    }
  } catch (error) {
    console.error('Failed to load path workspace:', error);
    return null;
  }
});

// --- Dynamic Workspace Manifest Editor & Wizard Operations ---
ipcMain.handle('workspace:check-config', async (_event, folderPath: string) => {
  try {
    if (!isWorkspaceRootSafe(folderPath)) return { exists: false };
    const configPath = path.join(folderPath, '.agentdeck', 'workspace.json');
    return { exists: fs.existsSync(configPath) };
  } catch (e) {
    console.error(e);
    return { exists: false };
  }
});

ipcMain.handle('workspace:initialize', async (_event, { folderPath, name, previewUrl, templateId }) => {
  try {
    if (!isWorkspaceRootSafe(folderPath)) {
      return { success: false, error: 'Invalid workspace folder. Select an existing absolute folder (no relative, empty, or ".." paths).' };
    }
    const agentdeckDir = path.join(folderPath, '.agentdeck');
    const configPath = path.join(agentdeckDir, 'workspace.json');
    
    if (!fs.existsSync(agentdeckDir)) {
      fs.mkdirSync(agentdeckDir, { recursive: true });
    }

    let services: any[] = [];
    let quickActions: any[] = [];
    
    if (templateId === 'vite') {
      services = [
        {
          id: 'frontend',
          label: 'Frontend Dev',
          shell: 'powershell.exe',
          command: 'npm run dev',
          cwd: '.'
        }
      ];
      quickActions = [
        {
          id: 'open-folder',
          label: 'Open Folder',
          type: 'openFolder'
        },
        {
          id: 'open-preview',
          label: 'Open Preview',
          type: 'previewUrl',
          url: previewUrl
        }
      ];
    } else if (templateId === 'fastapi') {
      services = [
        {
          id: 'backend',
          label: 'API Backend',
          shell: 'powershell.exe',
          command: 'uvicorn main:app --reload',
          cwd: '.'
        }
      ];
      quickActions = [
        {
          id: 'open-folder',
          label: 'Open Folder',
          type: 'openFolder'
        },
        {
          id: 'open-preview',
          label: 'Open Preview',
          type: 'previewUrl',
          url: previewUrl
        }
      ];
    } else if (templateId === 'static') {
      services = [
        {
          id: 'webserver',
          label: 'Static Webserver',
          shell: 'powershell.exe',
          command: 'npx -y serve',
          cwd: '.'
        }
      ];
      quickActions = [
        {
          id: 'open-folder',
          label: 'Open Folder',
          type: 'openFolder'
        }
      ];
    } else { // 'custom' or empty
      quickActions = [
        {
          id: 'open-folder',
          label: 'Open Folder',
          type: 'openFolder'
        }
      ];
    }

    const id = path.basename(folderPath).toLowerCase().replace(/[^a-z0-9]/g, '-');

    const newWorkspace = {
      schemaVersion: "agentdeck.workspace.v2",
      id,
      name,
      rootPath: folderPath,
      previewUrl,
      health: {
        type: 'http',
        url: previewUrl
      },
      services,
      quickActions,
      terminals: [
        {
          name: 'PowerShell',
          shell: 'powershell.exe',
          cwd: folderPath
        }
      ]
    };

    fs.writeFileSync(configPath, JSON.stringify(newWorkspace, null, 2), 'utf-8');
    addSystemLogInternal(`MANIFEST_SAVED: Initialized new workspace configuration at "${configPath}"`, 'success', id);
    return { success: true, workspace: newWorkspace };
  } catch (error: any) {
    console.error('Failed to initialize workspace:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('workspace:save', async (_event, { id, rootPath, config }) => {
  try {
    // A. Validate config
    const valResult = validateManifest(config);
    if (!valResult.valid) {
      const errorList = valResult.errors.map(e => `${e.field}: ${e.message}`).join(', ');
      return { success: false, error: `Validation failed: ${errorList}` };
    }

    // Determine destination path
    let configPath = '';
    const presetIds = ['tm4', 'sound-machina', 'robotstore'];
    if (presetIds.includes(id)) {
      configPath = path.join(WORKSPACES_DIR, `${id}.json`);
    } else if (rootPath) {
      // Dynamic discovered workspace
      if (!isWorkspaceRootSafe(rootPath)) {
        return { success: false, error: 'Invalid workspace folder. Select an existing absolute folder (no relative, empty, or ".." paths).' };
      }
      configPath = path.join(rootPath, '.agentdeck', 'workspace.json');
    } else {
      return { success: false, error: 'Target workspace root path is missing.' };
    }

    // Ensure directory exists
    const agentdeckDir = path.dirname(configPath);
    if (!fs.existsSync(agentdeckDir)) {
      fs.mkdirSync(agentdeckDir, { recursive: true });
    }

    // B. Backup previous manifest if exists, with YYYYMMDD-HHMM timestamp
    if (fs.existsSync(configPath)) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      
      const backupPath = `${configPath}.bak-${yyyy}${mm}${dd}-${hh}${min}`;
      fs.copyFileSync(configPath, backupPath);
    }

    // C. Write atomically
    const tempPath = `${configPath}.tmp-${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    
    // Rename/overwrite atomically
    fs.renameSync(tempPath, configPath);

    addSystemLogInternal(`MANIFEST_SAVED: Visual configuration saved for "${config.name}"`, 'success', id);
    return { success: true, workspace: config };
  } catch (error: any) {
    console.error('Failed to save workspace config:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('workspace:scanAgentTopology', async (_event, rootPath: string) => {
  try {
    return scanAgentTopologyInternal(rootPath);
  } catch (error: any) {
    console.error('Failed to scan workspace:', error);
    throw error;
  }
});

// --- Port Health Ping ---
// --- Managed Process Controls (extracted to ipc/processHandlers.ts, W5 PR 1) ---
registerProcessHandlers({
  ipcMain,
  processManager,
  terminalManager,
  getMainWindow: () => mainWindow,
});

// --- Resilient IDE Launcher (extracted to ipc/ideHandlers.ts, W5 PR 3) ---
registerIdeHandlers({
  ipcMain,
  shell,
  spawn,
  addSystemLogInternal,
});

// --- Evals persistence (extracted to ipc/evalsHandlers.ts, W5 PR 9) ---
registerEvalsHandlers({ ipcMain, getEvalsDir });

// --- Timeline persistence (extracted to ipc/timelineHandlers.ts, W5 PR 8) ---
registerTimelineHandlers({ ipcMain, getTimelineDir });

// --- Governance persistence (extracted to ipc/governanceHandlers.ts, W5 PR 7) ---
registerGovernanceHandlers({ ipcMain, getGovernanceDir });

// --- Snapshots (extracted to ipc/snapshotsHandlers.ts, W5 PR 10) ---
registerSnapshotsHandlers({ ipcMain, getSnapshotsDir, getEvalsDir, getTimelineDir, getGovernanceDir });

// --- Provenance Engine (extracted to ipc/provenanceHandlers.ts, W5 PR 6) ---
registerProvenanceHandlers({ ipcMain, getProvenancePath });

// --- Workspace Doctor (extracted to ipc/doctorHandlers.ts, W5 PR 11) ---
// runDoctorChecksInternal is returned here because the still-inline dep:generate
// handler (to be extracted in W5 PR 12) calls it with the same signature.
const { runDoctorChecksInternal, recordRemediationProvenance } = registerDoctorHandlers({
  ipcMain,
  dialog,
  BrowserWindow,
  getEvalsDir,
  getTimelineDir,
  getGovernanceDir,
  getProvenancePath,
  getSnapshotsDir,
  dataDir: DATA_DIR,
});

// Helper to get decisions directory
// Generate human-readable Markdown for compliance archiving
function generateDEPMarkdown(dep: any): string {
  const riskAssessment = dep.evidence.find((l: any) => l.layerId === 'risk-assessment')?.content || {};
  const candSummary = dep.evidence.find((l: any) => l.layerId === 'candidate-summary')?.content || {};
  const baseComparison = dep.evidence.find((l: any) => l.layerId === 'baseline-comparison')?.content || {};
  const evalEvidence = dep.evidence.find((l: any) => l.layerId === 'eval-evidence')?.content || {};
  const govEvidence = dep.evidence.find((l: any) => l.layerId === 'governance-evidence')?.content || {};
  const provChain = dep.evidence.find((l: any) => l.layerId === 'provenance-chain')?.content || {};
  const doctorReport = dep.evidence.find((l: any) => l.layerId === 'doctor-report')?.content || {};
  const snapEvidence = dep.evidence.find((l: any) => l.layerId === 'snapshot-evidence')?.content || {};

  return `# DECISION EVIDENCE PACKAGE: ${dep.id}
- **Created At**: ${dep.createdAt || 'N/A'}
- **Generated At**: ${dep.generatedAt || 'N/A'}
- **Generated By**: ${dep.generatedBy || 'N/A'}
- **Reviewed At**: ${dep.reviewedAt || 'N/A'}
- **Reviewed By**: ${dep.reviewedBy || 'N/A'}
- **Approved At**: ${dep.approvedAt || 'N/A'}
- **Approved By**: ${dep.approvedBy || 'N/A'}
- **Exported At**: ${dep.exportedAt || 'N/A'}
- **Exported By**: ${dep.exportedBy || 'N/A'}


## 1. EXECUTIVE SUMMARY
${dep.decisionSummary}

- **Decision Class**: ${dep.decisionClass.toUpperCase()}
- **Final Decision Status**: ${dep.finalDecision ? dep.finalDecision.toUpperCase() : 'PENDING'}
- **Decision Timestamp**: ${dep.approvedAt || 'N/A'}
- **Evidence Sufficiency**: ${dep.evidenceSufficiency.toUpperCase()}

### BOARD COMPLIANCE RATIONALE
${dep.decisionRationale || '*No human rationale provided.*'}
${dep.overrideReason ? `\n### OVERRIDE REASON\n${dep.overrideReason}` : ''}

---

## 2. EVIDENCE LAYERS

### LAYER 1: CANDIDATE SUMMARY
- **ID**: ${candSummary.id || 'N/A'}
- **Version**: ${candSummary.version || 'N/A'}
- **Created**: ${candSummary.timestamp || 'N/A'}
- **Owner**: ${candSummary.owner || 'N/A'}
- **Score**: ${candSummary.score !== undefined ? candSummary.score : 'N/A'}
- **Failures Count**: ${candSummary.failuresCount !== undefined ? candSummary.failuresCount : 'N/A'}

### LAYER 2: BASELINE COMPARISON
- **Active Baseline Score**: ${baseComparison.baselineScore !== undefined ? baseComparison.baselineScore : 'N/A'}
- **Candidate Score**: ${baseComparison.candidateScore !== undefined ? baseComparison.candidateScore : 'N/A'}
- **Regression Delta**: ${baseComparison.regressionDelta !== undefined ? baseComparison.regressionDelta : 'N/A'}
- **Governance Result**: ${baseComparison.policyResult || 'N/A'}

### LAYER 3: EVALUATION COMPLIANCE
- **Suite**: ${evalEvidence.benchmarkId || 'N/A'}
- **Regression Run ID**: ${evalEvidence.runId || 'N/A'}
- **Run Score**: ${evalEvidence.score !== undefined ? evalEvidence.score : 'N/A'}
- **Run Result Status**: ${evalEvidence.status || 'N/A'}
- **Test Failures Count**: ${evalEvidence.failuresCount || 0}

### LAYER 4: GOVERNANCE POLICY AUDIT
- **Minimum Score Allowed**: ${govEvidence.minScore !== undefined ? govEvidence.minScore : 'N/A'}
- **Allow Regressions**: ${govEvidence.allowRegression ? 'YES' : 'NO'}
- **Policy Compliance Check**: ${govEvidence.pass ? 'PASS' : 'FAIL'}
${govEvidence.reasons?.length > 0 ? `- Details:\n  ${govEvidence.reasons.map((r: string) => `* ${r}`).join('\n  ')}` : ''}

### LAYER 5: PROVENANCE TRAIL
Chronological mutation audit path leading to this release candidate:
${provChain.records?.length > 0 ? provChain.records.map((r: any, idx: number) => `[${idx + 1}] ${new Date(r.timestamp).toISOString()} - ${r.actor} performed ${r.mutationType} on ${r.sourceType} (${r.sourceId})`).join('\n') : 'No provenance trace found.'}

### LAYER 6: WORKSPACE DIAGNOSTICS REPORT
- **Overall Doctor Status**: ${doctorReport.status?.toUpperCase() || 'UNKNOWN'}
- **Checks Passed**: ${doctorReport.checksPassed !== undefined ? `${doctorReport.checksPassed} / ${doctorReport.checksTotal}` : 'N/A'}

### LAYER 7: SNAPSHOT METADATA
- **Reference Snapshot ID**: ${snapEvidence.snapshotId || 'N/A'}
- **Snapshot Hash**: ${snapEvidence.hash || 'N/A'}
- **Integrity Status**: ${snapEvidence.integrityStatus || 'N/A'}

### LAYER 8: RISK ASSESSMENT
- **Risk Severity Level**: ${riskAssessment.riskLevel || 'LOW'}
- **Risk Engine Points**: ${riskAssessment.riskPoints || 0}
- **Points Justification**:
  ${riskAssessment.breakdown ? Object.keys(riskAssessment.breakdown).map(k => `* ${k}: ${riskAssessment.breakdown[k]} points`).join('\n  ') : 'No warnings detected.'}

---

## 3. DECISION BOARD SIGN-OFFS
${dep.signatures?.length > 0 ? dep.signatures.map((sig: any) => `- **Authority**: ${sig.authority}\n  **Signed Off At**: ${sig.timestamp}\n  **Integrity Checksum (unkeyed SHA-256)**: ${sig.hash}`).join('\n') : '*This evidence package has not been signed off or finalized yet.*'}
`;
}

// IPC Handlers for Decision Evidence Packages (DEP)
ipcMain.handle('dep:generate', async (_event, { rootPath, presetId, candidateId }) => {
  try {
    const govDir = getGovernanceDir(rootPath, presetId);
    const evalsDir = getEvalsDir(rootPath, presetId);
    const snapshotsDir = getSnapshotsDir(rootPath, presetId);
    
    // 1. Load Release Candidate
    const candidatesPath = path.join(govDir, 'release_candidates.json');
    if (!fs.existsSync(candidatesPath)) {
      throw new Error('No release candidates registry found.');
    }
    const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
    const rc = candidates.find((c: any) => c.id === candidateId);
    if (!rc) {
      throw new Error(`Release candidate ${candidateId} not found.`);
    }

    // 2. Gather Evidence inputs
    const doctorReport = await runDoctorChecksInternal(rootPath, presetId);
    
    const provenancePath = getProvenancePath(rootPath, presetId);
    let provenanceList: any[] = [];
    if (fs.existsSync(provenancePath)) {
      try {
        const content = fs.readFileSync(provenancePath, 'utf-8');
        provenanceList = JSON.parse(content).records || [];
      } catch (e) {}
    }

    const runsPath = path.join(evalsDir, 'regression_runs.json');
    let runsList: any[] = [];
    if (fs.existsSync(runsPath)) {
      try { runsList = JSON.parse(fs.readFileSync(runsPath, 'utf-8')); } catch (e) {}
    }
    const targetRun = rc.runId ? runsList.find((r: any) => r.id === rc.runId) : null;

    const policiesPath = path.join(govDir, 'policies.json');
    let policies: any = { minScore: 0.8, allowRegression: false, requireApproval: true };
    if (fs.existsSync(policiesPath)) {
      try { policies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8')); } catch (e) {}
    }

    let snapshotsList: any[] = [];
    if (fs.existsSync(snapshotsDir)) {
      const files = fs.readdirSync(snapshotsDir);
      for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('temp_') && !file.includes('.compromised')) {
          try {
            const snap = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
            if (snap.manifest) snapshotsList.push(snap);
          } catch (e) {}
        }
      }
    }
    const associatedSnapshot = snapshotsList.find(s => s.manifest.workspaceId === presetId || s.manifest.parentSnapshotId) || snapshotsList[0];

    // 3. Compile Evidence layers
    // Layer 1: Candidate Summary
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

    // Layer 2: Baseline Comparison
    const layer2 = {
      layerId: 'baseline-comparison',
      title: 'Baseline Comparison Metrics',
      description: 'Compares Release Candidate evaluation score against the active promoted baseline.',
      content: {
        baselineScore: rc.baselineScore || 0.8,
        candidateScore: rc.score,
        regressionDelta: rc.regressionDelta || (rc.score - (rc.baselineScore || 0.8)),
        policyResult: rc.policyResult || 'requires_approval'
      }
    };

    // Layer 3: Evaluation Evidence
    const layer3 = {
      layerId: 'eval-evidence',
      title: 'Regression Run History details',
      description: 'Detailed evaluation scores, coverage data, and failed test cases.',
      content: {
        runId: rc.runId || 'N/A',
        benchmarkId: rc.benchmarkId,
        score: targetRun ? targetRun.score : rc.score,
        status: targetRun ? targetRun.status : 'pass',
        failuresCount: targetRun ? targetRun.failuresCount : rc.failuresCount
      }
    };

    // Layer 4: Governance Compliance
    const policyViolated = rc.score < policies.minScore || (rc.regressionDelta < 0 && !policies.allowRegression);
    const layer4 = {
      layerId: 'governance-evidence',
      title: 'Governance Policies Audit',
      description: 'Checks compliance against active governance policy score rules.',
      content: {
        minScore: policies.minScore,
        allowRegression: policies.allowRegression,
        pass: !policyViolated,
        reasons: policyViolated ? ['Evaluation score fell below governance minimum thresholds or regression was forbidden.'] : []
      }
    };

    // Layer 5: Provenance chain
    const filteredProv = provenanceList.slice(0, 5); // Trace last 5 actions
    const layer5 = {
      layerId: 'provenance-chain',
      title: 'Provenance Audit Trail',
      description: 'Timeline of chronological operations leading up to this decision.',
      content: {
        records: filteredProv
      }
    };

    // Layer 6: Doctor report
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

    // Layer 7: Snapshot linkage
    const layer7 = {
      layerId: 'snapshot-evidence',
      title: 'Workspace Snapshot Linkage',
      description: 'Identifies the checksummed snapshot of the workspace configuration state.',
      content: {
        snapshotId: associatedSnapshot ? associatedSnapshot.manifest.snapshotId : 'N/A',
        hash: associatedSnapshot ? associatedSnapshot.manifest.hash : 'N/A',
        integrityStatus: associatedSnapshot ? verifyHash(associatedSnapshot) : 'unsigned'
      }
    };

    const evidenceArray: any[] = [layer1, layer2, layer3, layer4, layer5, layer6, layer7];

    // 4. Freeze inputs & compute hash
    const sortObject = (o: any): any => {
      if (o === null || typeof o !== 'object') return o;
      if (Array.isArray(o)) return o.map(sortObject);
      return Object.keys(o).sort().reduce((acc: any, key: string) => {
        acc[key] = sortObject(o[key]);
        return acc;
      }, {});
    };
    const evidenceSnapshotHash = crypto.createHash('sha256').update(JSON.stringify(sortObject(evidenceArray))).digest('hex');

    // 5. Evidence Sufficiency check
    const sufficiencyDetails: string[] = [];
    if (!rc.runId) sufficiencyDetails.push('Missing evaluations regression run link.');
    if (provenanceList.length === 0) sufficiencyDetails.push('Missing provenance causality trail.');
    if (doctorReport.status === 'critical') sufficiencyDetails.push('Workspace diagnostics reported critical vulnerabilities.');
    
    const evidenceSufficiency = sufficiencyDetails.length === 0 ? 'pass' : 'fail';

    // 6. Deterministic Risk Engine
    let riskPoints = 0;
    const breakdown: Record<string, number> = {};

    const failedCount = targetRun ? targetRun.failuresCount : rc.failuresCount;
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

    // Layer 8: Risk Assessment
    const layer8 = {
      layerId: 'risk-assessment',
      title: 'Risk Assessment Severity Score',
      description: 'Scores risk levels deterministically based on files, tests, and policies.',
      content: {
        riskPoints,
        riskLevel,
        breakdown
      }
    };
    evidenceArray.push(layer8);

    // 7. RCs Recommendation Engine
    let recDecision: 'APPROVE' | 'REJECT' = 'APPROVE';
    let recConfidence = 90;
    if (policyViolated || doctorReport.status === 'critical') {
      recDecision = 'REJECT';
      recConfidence = policyViolated ? 95 : 75;
    }

    // 8. Board Decision Narrative
    const decisionSummary = `Release Candidate ${rc.version} was compiled under workspace ${presetId}. The evaluation scores reported an overall score of ${rc.score} (vs baseline ${rc.baselineScore || 0.8}). Governance audit yielded a ${policyViolated ? 'FAIL' : 'PASS'} recommendation status. Workspace diagnostics reported a status of ${doctorReport.status.toUpperCase()}.`;

    // Layer 9: Decision Narrative
    const layer9 = {
      layerId: 'decision-narrative',
      title: 'Executive Decision Narrative',
      description: 'Executive board justification for approval or rejection of this package.',
      content: {
        decisionSummary
      }
    };
    evidenceArray.push(layer9);

    // Layer 10: Signatures (Initially Empty)
    const layer10 = {
      layerId: 'signatures',
      title: 'Authorized Decision Board Sign-offs',
      description: 'Integrity checksums (unkeyed SHA-256) appended by authorized stakeholders.',
      content: {
        signatures: []
      }
    };
    evidenceArray.push(layer10);

    const depId = `DEP-${new Date().getFullYear()}-${candidateId.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase()}`;

    const dep: any = {
      schemaVersion: 'agentdeck.dep.v1',
      id: depId,
      timestamp: new Date().toISOString(),
      workspaceId: presetId,
      decisionClass: 'routine',
      decisionType: recDecision === 'APPROVE' ? 'approve' : 'reject',
      releaseCandidateId: candidateId,
      evidenceSnapshotHash,
      evidenceSufficiency,
      evidenceSufficiencyDetails: sufficiencyDetails,
      decisionSummary,
      decisionRationale: '',
      recommendation: {
        decision: recDecision,
        confidence: recConfidence,
        boardRecommendation: recDecision
      },
      finalDecision: recDecision === 'APPROVE' ? 'approve' : 'reject',
      createdAt: rc.timestamp || new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      generatedBy: 'System Engine',
      evidence: evidenceArray,
      signatures: []
    };

    return dep;
  } catch (error: any) {
    console.error('Failed to generate Decision Evidence Package:', error);
    throw error;
  }
});

ipcMain.handle('dep:sign-and-save', async (_event, { rootPath, presetId, dep, decisionRationale, decisionClass, overrideReason }) => {
  try {
    const govDir = getGovernanceDir(rootPath, presetId);
    const evalsDir = getEvalsDir(rootPath, presetId);
    
    // Update inputs
    dep.decisionRationale = decisionRationale;
    dep.decisionClass = decisionClass;
    dep.overrideReason = overrideReason;
    dep.reviewedBy = 'Operator';
    dep.reviewedAt = new Date().toISOString();
    dep.approvedBy = 'Release Board';
    dep.approvedAt = new Date().toISOString();
    dep.finalDecision = dep.decisionType;

    // Layer 10: Signatures
    const sigTimestamp = new Date().toISOString();
    const sigPayload = {
      authority: 'Release Board',
      rationale: decisionRationale,
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
    
    // Update signature evidence section
    const sigSection = dep.evidence.find((l: any) => l.layerId === 'signatures');
    if (sigSection) {
      sigSection.content.signatures = [signature];
    }

    // Compute top-level hash
    dep.hash = computeHash(dep);
    dep.integrityStatus = 'verified';

    // Save archive folder structure
    const decisionsDir = getDecisionsDir(rootPath, presetId);
    const depFolder = path.join(decisionsDir, `dep-${assertSafeId(dep.id, 'dep id')}`);
    if (!fs.existsSync(depFolder)) {
      fs.mkdirSync(depFolder, { recursive: true });
    }
    const evidenceFolder = path.join(depFolder, 'evidence');
    if (!fs.existsSync(evidenceFolder)) {
      fs.mkdirSync(evidenceFolder, { recursive: true });
    }

    // Write dep.json and dep.md
    fs.writeFileSync(path.join(depFolder, 'dep.json'), JSON.stringify(dep, null, 2), 'utf-8');
    const mdContent = generateDEPMarkdown(dep);
    fs.writeFileSync(path.join(depFolder, 'dep.md'), mdContent, 'utf-8');

    // Extract and write frozen evidence sub-JSONs
    const doctorRep = dep.evidence.find((l: any) => l.layerId === 'doctor-report')?.content || {};
    const provenanceRecs = dep.evidence.find((l: any) => l.layerId === 'provenance-chain')?.content || {};
    const snapshotMet = dep.evidence.find((l: any) => l.layerId === 'snapshot-evidence')?.content || {};
    const evaluationsData = dep.evidence.find((l: any) => l.layerId === 'eval-evidence')?.content || {};

    fs.writeFileSync(path.join(evidenceFolder, 'doctor-report.json'), JSON.stringify(doctorRep, null, 2), 'utf-8');
    fs.writeFileSync(path.join(evidenceFolder, 'provenance.json'), JSON.stringify(provenanceRecs, null, 2), 'utf-8');
    fs.writeFileSync(path.join(evidenceFolder, 'snapshot.json'), JSON.stringify(snapshotMet, null, 2), 'utf-8');
    fs.writeFileSync(path.join(evidenceFolder, 'evaluations.json'), JSON.stringify(evaluationsData, null, 2), 'utf-8');

    // Update Release Candidate
    const candidatesPath = path.join(govDir, 'release_candidates.json');
    if (fs.existsSync(candidatesPath)) {
      try {
        const content = fs.readFileSync(candidatesPath, 'utf-8');
        const list = JSON.parse(content);
        const updatedList = list.map((rc: any) => {
          if (rc.id === dep.releaseCandidateId) {
            rc.status = dep.decisionType; // 'approved' or 'rejected'
            rc.approvedBy = 'Release Board';
            rc.approvedAt = new Date().toISOString();
            rc.hash = computeHash(rc);
            rc.integrityStatus = 'verified';
          }
          return rc;
        });
        fs.writeFileSync(candidatesPath, JSON.stringify(updatedList, null, 2), 'utf-8');
      } catch (e) {}
    }

    // Log mutation provenance record
    const provRecord = {
      schemaVersion: 'agentdeck.provenance.v1',
      id: `prov-dep-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      actor: 'operator',
      mutationType: 'release_candidate_updated',
      sourceType: 'release_candidate',
      sourceId: dep.releaseCandidateId,
      before: { status: 'pending' },
      after: { status: dep.decisionType, decisionEvidencePackageId: dep.id }
    };
    await recordRemediationProvenance(rootPath, presetId, provRecord);

    return { success: true, dep };
  } catch (error: any) {
    console.error('Failed to sign and save Decision Evidence Package:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dep:load-all', async (_event, { rootPath, presetId }) => {
  try {
    const decisionsDir = getDecisionsDir(rootPath, presetId);
    if (!fs.existsSync(decisionsDir)) {
      return [];
    }
    const folders = fs.readdirSync(decisionsDir);
    const list: any[] = [];
    
    for (const folder of folders) {
      if (folder.startsWith('dep-')) {
        const depPath = path.join(decisionsDir, folder, 'dep.json');
        if (fs.existsSync(depPath)) {
          try {
            const content = fs.readFileSync(depPath, 'utf-8');
            const dep = JSON.parse(content);
            dep.integrityStatus = verifyHash(dep);
            list.push(dep);
          } catch (e) {
            console.error(`Failed to load decision package in ${folder}:`, e);
          }
        }
      }
    }
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  } catch (error) {
    console.error('Failed to load decision evidence packages:', error);
    return [];
  }
});

ipcMain.handle('dep:verify', async (_event, { rootPath, presetId, depId }) => {
  try {
    const decisionsDir = getDecisionsDir(rootPath, presetId);
    const depFolder = path.join(decisionsDir, `dep-${assertSafeId(depId, 'depId')}`);
    const depPath = path.join(depFolder, 'dep.json');

    if (!fs.existsSync(depPath)) {
      return { success: false, error: 'Evidence package record files missing.' };
    }
    const dep = JSON.parse(fs.readFileSync(depPath, 'utf-8'));
    const hashValid = verifyHash(dep) === 'verified';
    
    // Check referenced entities
    const govDir = getGovernanceDir(rootPath, presetId);
    const candidatesPath = path.join(govDir, 'release_candidates.json');
    let rcExists = false;
    if (fs.existsSync(candidatesPath)) {
      try {
        const list = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
        rcExists = list.some((rc: any) => rc.id === dep.releaseCandidateId);
      } catch (e) {}
    }

    // Snapshot
    const snapSection = dep.evidence.find((l: any) => l.layerId === 'snapshot-evidence')?.content || {};
    const snapshotId = snapSection.snapshotId;
    let snapshotExists = false;
    if (snapshotId && snapshotId !== 'N/A') {
      const snapshotsDir = getSnapshotsDir(rootPath, presetId);
      const snapshotPath = path.join(snapshotsDir, `snapshot-${assertSafeId(snapshotId, 'snapshotId')}.json`);
      snapshotExists = fs.existsSync(snapshotPath);
    }

    // Provenance link
    const provenancePath = getProvenancePath(rootPath, presetId);
    let provenanceExists = false;
    const provSection = dep.evidence.find((l: any) => l.layerId === 'provenance-chain')?.content || {};
    if (provSection.records && provSection.records.length > 0 && fs.existsSync(provenancePath)) {
      try {
        const provLedger = JSON.parse(fs.readFileSync(provenancePath, 'utf-8')).records || [];
        provenanceExists = provSection.records.every((r: any) => provLedger.some((pl: any) => pl.id === r.id));
      } catch (e) {}
    }

    const signatureValid = dep.signatures && dep.signatures.length > 0;

    return {
      success: true,
      hashValid,
      signatureValid,
      rcExists,
      snapshotExists,
      provenanceExists,
      integrityStatus: (hashValid && signatureValid) ? 'verified' : 'tampered'
    };
  } catch (error: any) {
    console.error('DEP Verification failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dep:export-json', async (_event, { rootPath, presetId, depId }) => {
  try {
    const decisionsDir = getDecisionsDir(rootPath, presetId);
    const depPath = path.join(decisionsDir, `dep-${assertSafeId(depId, 'depId')}`, 'dep.json');
    if (!fs.existsSync(depPath)) {
      return { success: false, error: 'DEP json file missing.' };
    }
    const dep = JSON.parse(fs.readFileSync(depPath, 'utf-8'));
    dep.exportedAt = new Date().toISOString();
    dep.exportedBy = 'Release Board Member';
    
    // Save updated back to dep.json
    fs.writeFileSync(depPath, JSON.stringify(dep, null, 2), 'utf-8');
    const bundle = JSON.stringify(dep, null, 2);

    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No focused application window found.' };

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Compliance Decision JSON',
      defaultPath: `dep-${depId}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return { success: false, error: 'Export cancelled.' };

    fs.writeFileSync(filePath, bundle, 'utf-8');
    return { success: true, filePath };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dep:export-markdown', async (_event, { rootPath, presetId, depId }) => {
  try {
    const decisionsDir = getDecisionsDir(rootPath, presetId);
    const depPath = path.join(decisionsDir, `dep-${assertSafeId(depId, 'depId')}`, 'dep.json');
    if (!fs.existsSync(depPath)) return { success: false, error: 'DEP files missing.' };
    const dep = JSON.parse(fs.readFileSync(depPath, 'utf-8'));
    dep.exportedAt = new Date().toISOString();
    dep.exportedBy = 'Release Board Member';
    
    // Save updated back to dep.json and generate new dep.md
    fs.writeFileSync(depPath, JSON.stringify(dep, null, 2), 'utf-8');
    
    const mdContent = generateDEPMarkdown(dep);
    const mdPath = path.join(decisionsDir, `dep-${assertSafeId(depId, 'depId')}`, 'dep.md');
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No focused application window found.' };

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Compliance Decision Markdown',
      defaultPath: `dep-${depId}.md`,
      filters: [{ name: 'Markdown Files', extensions: ['md'] }]
    });

    if (canceled || !filePath) return { success: false, error: 'Export cancelled.' };

    fs.writeFileSync(filePath, mdContent, 'utf-8');
    return { success: true, filePath };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});
