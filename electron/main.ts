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

// IPC Handlers for Evals Persistence
ipcMain.handle('evals:load-data', async (_event, { rootPath, presetId }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    const failuresDir = path.join(evalsDir, 'failures');
    
    const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
    const runsPath = path.join(evalsDir, 'regression_runs.json');

    let benchmarks: any[] = [];
    let runs: any[] = [];
    let failures: any[] = [];

    // Load Benchmarks
    if (fs.existsSync(benchmarksPath)) {
      benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8'));
    } else {
      // Default Mock Presets
      if (presetId === 'sound-machina') {
        benchmarks = [
          {
            id: 'sound-machina-prompt-quality',
            name: 'Sound Machina Prompt Quality',
            description: 'Evaluates quality of generated music prompts against core aesthetic criteria.',
            criteria: ['Melodic structure', 'Novelty', 'Genre consistency', 'Production usability'],
            baselineScore: 0.87,
            goldStandardsCount: 15,
            testCases: [
              {
                id: 'tc-suno-1',
                benchmarkId: 'sound-machina-prompt-quality',
                prompt: 'Chill lofi hiphop beat with jazzy piano chords',
                expected: 'Smooth lofi drums, vinyl crackle, warm rhodes/piano chords, and mellow bassline.',
                threshold: 0.8
              },
              {
                id: 'tc-suno-2',
                benchmarkId: 'sound-machina-prompt-quality',
                prompt: 'Industrial techno track with driving bass and metallic synth hits',
                expected: 'Heavy 4/4 industrial kick drum, aggressive sub-bass rhythm, and metallic percussion loops.',
                threshold: 0.82
              }
            ]
          }
        ];
      } else if (presetId === 'tm4') {
        benchmarks = [
          {
            id: 'tm4-governance',
            name: 'TM4 Studio Governance',
            description: 'Assesses compliance, artifact integrity, and report completeness of system runs.',
            criteria: ['Report Completeness', 'Governance Compliance', 'Artifact Integrity'],
            baselineScore: 0.97,
            goldStandardsCount: 20,
            testCases: [
              {
                id: 'tc-tm4-1',
                benchmarkId: 'tm4-governance',
                prompt: 'Workspace verification audit run',
                expected: 'All output manifests comply with v2 schemaVersion and have security logs populated.',
                threshold: 0.92
              }
            ]
          }
        ];
      } else {
        // Generic defaults
        benchmarks = [
          {
            id: `${presetId}-evals`,
            name: `${presetId} Standard Evaluation`,
            description: 'Default benchmark suite for quality and response integrity.',
            criteria: ['Response accuracy', 'Style alignment', 'Performance'],
            baselineScore: 0.80,
            goldStandardsCount: 5,
            testCases: []
          }
        ];
      }
    }

    // Load Regression Runs
    if (fs.existsSync(runsPath)) {
      runs = JSON.parse(fs.readFileSync(runsPath, 'utf-8'));
    } else {
      // Demo run history
      if (presetId === 'sound-machina') {
        runs = [
          {
            id: 'run-sound-machina-1',
            benchmarkId: 'sound-machina-prompt-quality',
            timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
            score: 0.88,
            baselineScore: 0.87,
            diff: 0.01,
            status: 'pass',
            failuresCount: 0,
            triggerContext: 'Added tempo constraints to Prompt Engine',
            isSimulated: true,
            isApproved: true
          },
          {
            id: 'run-sound-machina-2',
            benchmarkId: 'sound-machina-prompt-quality',
            timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
            score: 0.82,
            baselineScore: 0.87,
            diff: -0.05,
            status: 'regression_detected',
            failuresCount: 1,
            triggerContext: 'Prompt Engine Update (v0.6)',
            isSimulated: true,
            isApproved: false
          }
        ];
      } else if (presetId === 'tm4') {
        runs = [
          {
            id: 'run-tm4-1',
            benchmarkId: 'tm4-governance',
            timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
            score: 0.98,
            baselineScore: 0.97,
            diff: 0.01,
            status: 'pass',
            failuresCount: 0,
            triggerContext: 'Initial baseline evaluation pass',
            isSimulated: true,
            isApproved: true
          }
        ];
      }
    }

    // Load Failures
    if (fs.existsSync(failuresDir)) {
      const files = fs.readdirSync(failuresDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const fileData = fs.readFileSync(path.join(failuresDir, file), 'utf-8');
            failures.push(JSON.parse(fileData));
          } catch (e) {
            console.error('Error reading failure file:', file, e);
          }
        }
      }
    } else {
      // Demo failures
      if (presetId === 'sound-machina') {
        failures = [
          {
            id: 'fail-sound-machina-1',
            benchmarkId: 'sound-machina-prompt-quality',
            prompt: 'Coldwave track',
            expected: 'Generated track has dark synth pads and a prominent 80s drum beat.',
            actual: 'Generated EDM clichés with bright trance leads and 128 bpm drop.',
            failureDescription: 'Generated EDM clichés instead of coldwave elements.',
            resolution: 'Added explicit genre constraints and reference artists to the Coldwave prompt template.',
            resolved: true,
            timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
          }
        ];
      }
    }

    // Load Gold Standards
    const goldStandardsDir = path.join(evalsDir, 'gold-standards');
    let goldStandards: any[] = [];
    if (fs.existsSync(goldStandardsDir)) {
      const files = fs.readdirSync(goldStandardsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const fileData = fs.readFileSync(path.join(goldStandardsDir, file), 'utf-8');
            goldStandards.push(JSON.parse(fileData));
          } catch (e) {
            console.error('Error reading gold standard file:', file, e);
          }
        }
      }
    } else {
      // Mock Gold Standards for presets
      if (presetId === 'sound-machina') {
        goldStandards = [
          {
            id: 'gold_suno_ambient',
            title: 'Best Ambient Synth Drone',
            content: 'Deep cosmic cinematic background, slow analog modular synth drone, tape hiss, minor chords, pitch drifts, 70 bpm, spacious reverb.',
            tags: ['music', 'ambient', 'suno'],
            type: 'prompt',
            source: 'operator',
            createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
          },
          {
            id: 'gold_youtube_synthwave',
            title: 'Best Synthwave YouTube Release Note',
            content: '🎵 Listen to Sound Machina\'s latest retro synthwave track! Featuring heavy Roland Juno-106 bassline arpeggios, gated LinnDrum hits, and soaring vintage lead synthesizers. #synthwave #musicai #cyberpunk',
            tags: ['text', 'marketing', 'youtube'],
            type: 'output',
            source: 'gold-standard-pipeline',
            createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
          }
        ];
      } else if (presetId === 'tm4') {
        goldStandards = [
          {
            id: 'gold_tm4_arch_report',
            title: 'Standard Architecture Audit Spec',
            content: 'Architecture Compliance Report: Verified TM4 Studio manifest schemas. Target runtime maps to Node.js v18.16. WSL subsystems online. Security policies satisfied.',
            tags: ['audit', 'compliance', 'tm4'],
            type: 'document',
            source: 'lead-architect',
            createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
          }
        ];
      }
    }

    // Load Judges
    const judgesPath = path.join(evalsDir, 'judges.json');
    let judges: any[] = [];
    if (fs.existsSync(judgesPath)) {
      judges = JSON.parse(fs.readFileSync(judgesPath, 'utf-8'));
    } else {
      // Mock Judges for presets
      if (presetId === 'sound-machina') {
        judges = [
          {
            id: 'suno-prompt-judge',
            name: 'SunoPromptJudge',
            criteria: ['clarity', 'musical specificity', 'genre consistency', 'production detail'],
            threshold: 0.8
          }
        ];
      } else if (presetId === 'tm4') {
        judges = [
          {
            id: 'tm4-audit-judge',
            name: 'TM4StudioGovernanceJudge',
            criteria: ['Report Completeness', 'Governance Compliance', 'Artifact Integrity'],
            threshold: 0.9
          }
        ];
      } else {
        judges = [
          {
            id: 'default-judge',
            name: 'DefaultQualityJudge',
            criteria: ['Response accuracy', 'Style alignment', 'Performance'],
            threshold: 0.8
          }
        ];
      }
    }

    // Load Promotions
    const promotionsPath = path.join(evalsDir, 'promotions.json');
    let promotions: any[] = [];
    if (fs.existsSync(promotionsPath)) {
      promotions = JSON.parse(fs.readFileSync(promotionsPath, 'utf-8'));
    } else {
      // Mock Promotions for presets
      if (presetId === 'sound-machina') {
        promotions = [
          {
            timestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
            benchmarkId: 'sound-machina-prompt-quality',
            benchmarkName: 'Sound Machina Prompt Quality',
            oldScore: 0.84,
            newScore: 0.87,
            approvedBy: 'operator',
            reason: 'Tuned model system instructions to prevent trance cliches.',
            runId: 'run-sound-machina-1'
          }
        ];
      }
    }

    return { benchmarks, runs, failures, goldStandards, judges, promotions };
  } catch (error) {
    console.error('Failed to load evals data:', error);
    return { benchmarks: [], runs: [], failures: [], goldStandards: [], judges: [], promotions: [] };
  }
});

ipcMain.handle('evals:save-benchmarks', async (_event, { rootPath, presetId, benchmarks }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    if (!fs.existsSync(evalsDir)) {
      fs.mkdirSync(evalsDir, { recursive: true });
    }
    const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
    fs.writeFileSync(benchmarksPath, JSON.stringify(benchmarks, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save benchmarks:', error);
    return false;
  }
});

ipcMain.handle('evals:save-failure', async (_event, { rootPath, presetId, failure }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    const failuresDir = path.join(evalsDir, 'failures');
    if (!fs.existsSync(failuresDir)) {
      fs.mkdirSync(failuresDir, { recursive: true });
    }
    const filePath = path.join(failuresDir, `failure-${assertSafeId(failure.id, 'failure id')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(failure, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save failure case:', error);
    return false;
  }
});

ipcMain.handle('evals:delete-failure', async (_event, { rootPath, presetId, failureId }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    const filePath = path.join(evalsDir, 'failures', `failure-${assertSafeId(failureId, 'failureId')}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to delete failure case:', error);
    return false;
  }
});

ipcMain.handle('evals:save-regression-history', async (_event, { rootPath, presetId, history }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    if (!fs.existsSync(evalsDir)) {
      fs.mkdirSync(evalsDir, { recursive: true });
    }
    const runsPath = path.join(evalsDir, 'regression_runs.json');
    fs.writeFileSync(runsPath, JSON.stringify(history, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save regression runs history:', error);
    return false;
  }
});

ipcMain.handle('evals:save-gold-standard', async (_event, { rootPath, presetId, item }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    const goldStandardsDir = path.join(evalsDir, 'gold-standards');
    if (!fs.existsSync(goldStandardsDir)) {
      fs.mkdirSync(goldStandardsDir, { recursive: true });
    }
    const filePath = path.join(goldStandardsDir, `gold-${assertSafeId(item.id, 'gold standard id')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(item, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save gold standard:', error);
    return false;
  }
});

ipcMain.handle('evals:delete-gold-standard', async (_event, { rootPath, presetId, id }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    const filePath = path.join(evalsDir, 'gold-standards', `gold-${assertSafeId(id, 'gold standard id')}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to delete gold standard:', error);
    return false;
  }
});

ipcMain.handle('evals:save-judges', async (_event, { rootPath, presetId, list }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    if (!fs.existsSync(evalsDir)) {
      fs.mkdirSync(evalsDir, { recursive: true });
    }
    const filePath = path.join(evalsDir, 'judges.json');
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save judges list:', error);
    return false;
  }
});

ipcMain.handle('evals:save-promotions', async (_event, { rootPath, presetId, list }) => {
  try {
    const evalsDir = getEvalsDir(rootPath, presetId);
    if (!fs.existsSync(evalsDir)) {
      fs.mkdirSync(evalsDir, { recursive: true });
    }
    const filePath = path.join(evalsDir, 'promotions.json');
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save promotions list:', error);
    return false;
  }
});

// Helper to get timeline directory
// IPC Handlers for Timeline Persistence
ipcMain.handle('timeline:load-events', async (_event, { rootPath, presetId }) => {
  try {
    const timelineDir = getTimelineDir(rootPath, presetId);
    if (!fs.existsSync(timelineDir)) {
      fs.mkdirSync(timelineDir, { recursive: true });
    }
    
    let files = fs.readdirSync(timelineDir);
    
    // Auto-seed if timeline is empty and it's a preset
    const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
    if (files.length === 0 && PRESET_IDS.includes(presetId)) {
      const defaultEvents: any[] = [];
      const now = new Date();
      
      if (presetId === 'sound-machina') {
        defaultEvents.push(
          {
            id: 'seed-sm-1',
            schemaVersion: 'agentdeck.timeline.v1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
            workspaceId: presetId,
            type: 'service_started',
            severity: 'info',
            actor: 'operator',
            isSeeded: true,
            referenceId: 'service-sm-powershell',
            summary: 'Audio generation service started on local shell powershell (SEEDED SAMPLE)',
            metadata: {
              logsSnapshot: [
                '[12:00:00 AM] [TerminalManager] Spawned session term-sound-machina-powershell',
                '[12:00:01 AM] Suno v3 engine online',
                '[12:00:02 AM] Listening on http://localhost:3000'
              ]
            }
          },
          {
            id: 'seed-sm-2',
            schemaVersion: 'agentdeck.timeline.v1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 1.5).toISOString(), // 1.5 hours ago
            workspaceId: presetId,
            type: 'regression_executed',
            severity: 'warning',
            actor: 'simulator',
            isSeeded: true,
            referenceId: 'run-sound-machina-1',
            summary: 'Sound Machina Prompt Quality regression run completed - 1 fault detected (SEEDED SAMPLE)',
            metadata: {
              benchmarkScore: 0.78,
              baselineScore: 0.81,
              passRate: 75,
              failuresCount: 1,
              logsSnapshot: [
                '[Evaluator] Deploying test prompt instances against local models...',
                '[Evaluator] CASE SM-1: PASSED (score: 0.88)',
                '[Evaluator] CASE SM-2: PASSED (score: 0.84)',
                '[Evaluator] CASE SM-3: FAILED (score: 0.62) - Output contains trance synths'
              ]
            }
          },
          {
            id: 'seed-sm-3',
            schemaVersion: 'agentdeck.timeline.v1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60).toISOString(), // 1 hour ago
            workspaceId: presetId,
            type: 'failure_converted',
            severity: 'success',
            actor: 'operator',
            isSeeded: true,
            referenceId: 'fail-sound-machina-1',
            summary: 'Converted faulty bassline output to a permanent test case spec in Sound Machina Prompt Quality (SEEDED SAMPLE)',
            metadata: {
              failuresCount: 0,
              logsSnapshot: [
                '[Operator Action] Initiating Failure -> Test Spec Conversion',
                '[Store] Stored testcase tc-seed-sm-1 with threshold 0.80'
              ]
            }
          },
          {
            id: 'seed-sm-4',
            schemaVersion: 'agentdeck.timeline.v1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 30).toISOString(), // 30 mins ago
            workspaceId: presetId,
            type: 'baseline_promoted',
            severity: 'success',
            actor: 'operator',
            isSeeded: true,
            referenceId: 'run-sound-machina-2',
            summary: 'Baseline target score promoted: 0.81 -> 0.87 (SEEDED SAMPLE)',
            metadata: {
              baselineScore: 0.87,
              oldScore: 0.81,
              logsSnapshot: [
                '[Promoter] Verified regression run run-sound-machina-2 passes safety threshold',
                '[Governance] Baseline updated to 0.87'
              ]
            }
          }
        );
      } else if (presetId === 'tm4') {
        defaultEvents.push(
          {
            id: 'seed-tm-1',
            schemaVersion: 'agentdeck.timeline.v1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 3).toISOString(),
            workspaceId: presetId,
            type: 'service_started',
            severity: 'info',
            actor: 'operator',
            isSeeded: true,
            referenceId: 'service-tm4-fastapi',
            summary: 'FastAPI Governance Engine started on port 8000 (SEEDED SAMPLE)',
            metadata: {
              logsSnapshot: [
                '[09:00:00 AM] Uvicorn running on http://127.0.0.1:8000',
                '[09:00:01 AM] Loaded security rubrics configuration'
              ]
            }
          },
          {
            id: 'seed-tm-2',
            schemaVersion: 'agentdeck.timeline.v1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(),
            workspaceId: presetId,
            type: 'regression_executed',
            severity: 'success',
            actor: 'simulator',
            isSeeded: true,
            referenceId: 'run-tm4-1',
            summary: 'TM4 Governance Compliance regression check completed successfully (SEEDED SAMPLE)',
            metadata: {
              benchmarkScore: 0.98,
              baselineScore: 0.95,
              passRate: 100,
              failuresCount: 0,
              logsSnapshot: [
                '[Evaluator] Auditing compliance templates...',
                '[Evaluator] Report completeness check: 0.99',
                '[Evaluator] Artifact integrity check: 0.97',
                '[Evaluator] SUCCESS - 100% compliance met'
              ]
            }
          }
        );
      } else if (presetId === 'robotstore') {
        defaultEvents.push(
          {
            id: 'seed-rs-1',
            schemaVersion: 'agentdeck.timeline.v1',
            timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 4).toISOString(),
            workspaceId: presetId,
            type: 'service_started',
            severity: 'info',
            actor: 'operator',
            isSeeded: true,
            referenceId: 'service-rs-vite',
            summary: 'RobotStore React UI Frontend dev server started (SEEDED SAMPLE)',
            metadata: {
              logsSnapshot: [
                '[VITE] dev server running on http://localhost:5173'
              ]
            }
          }
        );
      }
      
      for (const ev of defaultEvents) {
        ev.hash = computeHash(ev);
        const filePath = path.join(timelineDir, `event-${ev.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(ev, null, 2), 'utf-8');
      }
      files = fs.readdirSync(timelineDir);
    }
    
    const events: any[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(timelineDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const ev = JSON.parse(content);
          ev.integrityStatus = verifyHash(ev);
          events.push(ev);
        } catch (e) {
          console.error(`Failed to parse timeline event file ${file}:`, e);
        }
      }
    }
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  } catch (error) {
    console.error('Failed to load timeline events:', error);
    return [];
  }
});

ipcMain.handle('timeline:save-event', async (_event, { rootPath, presetId, event }) => {
  try {
    const timelineDir = getTimelineDir(rootPath, presetId);
    if (!fs.existsSync(timelineDir)) {
      fs.mkdirSync(timelineDir, { recursive: true });
    }
    event.hash = computeHash(event);
    const filePath = path.join(timelineDir, `event-${assertSafeId(event.id, 'event id')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(event, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save timeline event:', error);
    return false;
  }
});

// Helper to get governance directory
// IPC Handlers for Governance persistence
ipcMain.handle('governance:load-data', async (_event, { rootPath, presetId }) => {
  try {
    const govDir = getGovernanceDir(rootPath, presetId);
    if (!fs.existsSync(govDir)) {
      fs.mkdirSync(govDir, { recursive: true });
    }
    
    const policiesPath = path.join(govDir, 'policies.json');
    const candidatesPath = path.join(govDir, 'release_candidates.json');
    
    let policies: any = null;
    let releaseCandidates: any[] = [];
    
    // Load or seed policies
    if (fs.existsSync(policiesPath)) {
      policies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));
      policies.integrityStatus = verifyHash(policies);
    } else {
      // Default Mock Policies for Presets
      if (presetId === 'sound-machina') {
        policies = {
          schemaVersion: 'agentdeck.governance.v1',
          minScore: 0.80,
          allowRegression: false,
          requireApproval: true
        };
      } else if (presetId === 'tm4') {
        policies = {
          schemaVersion: 'agentdeck.governance.v1',
          minScore: 0.95,
          allowRegression: false,
          requireApproval: true
        };
      } else {
        policies = {
          schemaVersion: 'agentdeck.governance.v1',
          minScore: 0.80,
          allowRegression: false,
          requireApproval: false
        };
      }
      policies.hash = computeHash(policies);
      policies.integrityStatus = 'verified';
      fs.writeFileSync(policiesPath, JSON.stringify(policies, null, 2), 'utf-8');
    }
    
    // Load or seed release candidates
    if (fs.existsSync(candidatesPath)) {
      const list = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
      releaseCandidates = list.map((rc: any) => {
        rc.integrityStatus = verifyHash(rc);
        return rc;
      });
    } else {
      // Seed an initial demo release candidate if empty for presets
      if (presetId === 'sound-machina') {
        releaseCandidates = [
          {
            id: 'rc-seed-sm-1',
            schemaVersion: 'agentdeck.governance.v1',
            version: 'v1.0.0-rc1',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            status: 'approved',
            score: 0.88,
            benchmarkId: 'sound-machina-prompt-quality',
            failuresCount: 0,
            timelineEventId: 'seed-sm-1',
            policyResult: 'pass',
            policyReasons: ['Score 0.88 is above minScore 0.80', 'No regressions detected'],
            notes: 'Production ready audio generation engine.',
            approvedBy: 'operator',
            approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 23.5).toISOString()
          }
        ];
      } else if (presetId === 'tm4') {
        releaseCandidates = [
          {
            id: 'rc-seed-tm-1',
            schemaVersion: 'agentdeck.governance.v1',
            version: 'v0.9.0-rc1',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
            status: 'released',
            score: 0.98,
            benchmarkId: 'tm4-governance-compliance',
            failuresCount: 0,
            timelineEventId: 'seed-tm-2',
            policyResult: 'pass',
            policyReasons: ['Score 0.98 is above minScore 0.95'],
            notes: 'Compliance criteria fully satisfied. Released to staging operator check.',
            approvedBy: 'operator',
            approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 47).toISOString()
          }
        ];
      }
      
      releaseCandidates = releaseCandidates.map((rc: any) => {
        rc.hash = computeHash(rc);
        rc.integrityStatus = 'verified';
        return rc;
      });
      fs.writeFileSync(candidatesPath, JSON.stringify(releaseCandidates, null, 2), 'utf-8');
    }
    
    return { policies, releaseCandidates };
  } catch (error) {
    console.error('Failed to load governance data:', error);
    return { policies: null, releaseCandidates: [] };
  }
});

ipcMain.handle('governance:save-policies', async (_event, { rootPath, presetId, policies }) => {
  try {
    const govDir = getGovernanceDir(rootPath, presetId);
    if (!fs.existsSync(govDir)) {
      fs.mkdirSync(govDir, { recursive: true });
    }
    policies.hash = computeHash(policies);
    const filePath = path.join(govDir, 'policies.json');
    fs.writeFileSync(filePath, JSON.stringify(policies, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save governance policies:', error);
    return false;
  }
});

ipcMain.handle('governance:save-candidates', async (_event, { rootPath, presetId, list }) => {
  try {
    const govDir = getGovernanceDir(rootPath, presetId);
    if (!fs.existsSync(govDir)) {
      fs.mkdirSync(govDir, { recursive: true });
    }
    const listWithHashes = list.map((rc: any) => {
      rc.hash = computeHash(rc);
      return rc;
    });
    const filePath = path.join(govDir, 'release_candidates.json');
    fs.writeFileSync(filePath, JSON.stringify(listWithHashes, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save release candidates list:', error);
    return false;
  }
});

// Helper to get snapshots directory
// IPC Handlers for Snapshots
ipcMain.handle('snapshots:load-all', async (_event, { rootPath, presetId }) => {
  try {
    const snapshotsDir = getSnapshotsDir(rootPath, presetId);
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    const files = fs.readdirSync(snapshotsDir);
    const list: any[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('temp_')) {
        const filePath = path.join(snapshotsDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const snap = JSON.parse(content);
          
          // Verify hash of full snapshot
          const integrityStatus = verifyHash(snap);
          
          list.push({
            ...snap.manifest,
            integrityStatus
          });
        } catch (e) {
          console.error(`Failed to parse snapshot file ${file}:`, e);
        }
      }
    }
    
    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (error) {
    console.error('Failed to load snapshots:', error);
    return [];
  }
});

ipcMain.handle('snapshots:create', async (_event, { rootPath, presetId, description, type, payload, parentSnapshotId }) => {
  try {
    const snapshotsDir = getSnapshotsDir(rootPath, presetId);
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    
    const snapshotId = `snap-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    
    const manifest: any = {
      schemaVersion: 'agentdeck.snapshot.v1',
      snapshotId,
      createdAt,
      workspaceId: presetId,
      description,
      type
    };
    
    if (parentSnapshotId) {
      manifest.parentSnapshotId = parentSnapshotId;
    }
    
    const fullSnapshot: any = {
      manifest,
      payload
    };
    
    // Compute SHA-256 hash of the entire snapshot (excluding hash/integrityStatus inside manifest)
    const hash = computeHash(fullSnapshot);
    fullSnapshot.manifest.hash = hash;
    
    const filePath = path.join(snapshotsDir, `snapshot-${assertSafeId(snapshotId, 'snapshotId')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(fullSnapshot, null, 2), 'utf-8');
    
    return {
      ...fullSnapshot.manifest,
      integrityStatus: 'verified'
    };
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    throw error;
  }
});

ipcMain.handle('snapshots:load-payload', async (_event, { rootPath, presetId, snapshotId }) => {
  try {
    const snapshotsDir = getSnapshotsDir(rootPath, presetId);
    const filePath = path.join(snapshotsDir, `snapshot-${assertSafeId(snapshotId, 'snapshotId')}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Snapshot with ID ${snapshotId} not found.`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const snap = JSON.parse(content);
    return snap.payload;
  } catch (error) {
    console.error('Failed to load snapshot payload:', error);
    throw error;
  }
});

ipcMain.handle('snapshots:restore', async (_event, { rootPath, presetId, snapshotId }) => {
  const snapshotsDir = getSnapshotsDir(rootPath, presetId);
  const tempRestoreDir = path.join(snapshotsDir, `temp_restore_${Date.now()}`);
  
  try {
    const snapshotPath = path.join(snapshotsDir, `snapshot-${assertSafeId(snapshotId, 'snapshotId')}.json`);
    if (!fs.existsSync(snapshotPath)) {
      return { success: false, error: `Snapshot ${snapshotId} does not exist.` };
    }
    
    const snapContent = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(snapContent);
    
    // 1. Verify Hash
    const integrity = verifyHash(snapshot);
    if (integrity !== 'verified') {
      return { success: false, error: `Restore blocked: Snapshot hash integrity check failed (${integrity.toUpperCase()}).` };
    }
    
    // Create temp restore directory
    fs.mkdirSync(tempRestoreDir, { recursive: true });
    
    const payload = snapshot.payload;
    const isPreset = ['sound-machina', 'tm4', 'robotstore'].includes(presetId);
    
    // Resolve destination folders
    const evalsDir = getEvalsDir(rootPath, presetId);
    const timelineDir = getTimelineDir(rootPath, presetId);
    const govDir = getGovernanceDir(rootPath, presetId);
    
    // 2. Write temp restored files
    
    // A. Workspace manifest (if not a static built-in preset)
    if (!isPreset && rootPath) {
      const tempConfigPath = path.join(tempRestoreDir, 'workspace.json');
      fs.writeFileSync(tempConfigPath, JSON.stringify(payload.manifest, null, 2), 'utf-8');
    }
    
    // B. Governance files
    const tempGovDir = path.join(tempRestoreDir, 'governance');
    fs.mkdirSync(tempGovDir, { recursive: true });
    fs.writeFileSync(path.join(tempGovDir, 'policies.json'), JSON.stringify(payload.policies, null, 2), 'utf-8');
    fs.writeFileSync(path.join(tempGovDir, 'release_candidates.json'), JSON.stringify(payload.releaseCandidates, null, 2), 'utf-8');
    
    // C. Evals files
    const tempEvalsDir = path.join(tempRestoreDir, 'evals');
    fs.mkdirSync(tempEvalsDir, { recursive: true });
    fs.writeFileSync(path.join(tempEvalsDir, 'benchmarks.json'), JSON.stringify(payload.benchmarks || [], null, 2), 'utf-8');
    fs.writeFileSync(path.join(tempEvalsDir, 'judges.json'), JSON.stringify(payload.judges || [], null, 2), 'utf-8');
    fs.writeFileSync(path.join(tempEvalsDir, 'promotions.json'), JSON.stringify(payload.promotions || [], null, 2), 'utf-8');
    fs.writeFileSync(path.join(tempEvalsDir, 'regression_runs.json'), JSON.stringify(payload.regressionRuns || [], null, 2), 'utf-8');
    
    const tempFailuresDir = path.join(tempEvalsDir, 'failures');
    fs.mkdirSync(tempFailuresDir, { recursive: true });
    if (Array.isArray(payload.failures)) {
      for (const fail of payload.failures) {
        fs.writeFileSync(path.join(tempFailuresDir, `fail-${fail.id}.json`), JSON.stringify(fail, null, 2), 'utf-8');
      }
    }
    
    const tempGoldStandardsDir = path.join(tempEvalsDir, 'gold-standards');
    fs.mkdirSync(tempGoldStandardsDir, { recursive: true });
    if (Array.isArray(payload.goldStandards)) {
      for (const item of payload.goldStandards) {
        fs.writeFileSync(path.join(tempGoldStandardsDir, `gold-${assertSafeId(item.id, 'gold standard id')}.json`), JSON.stringify(item, null, 2), 'utf-8');
      }
    }
    
    // D. Timeline files
    const tempTimelineDir = path.join(tempRestoreDir, 'timeline');
    fs.mkdirSync(tempTimelineDir, { recursive: true });
    if (Array.isArray(payload.timelineEvents)) {
      for (const ev of payload.timelineEvents) {
        fs.writeFileSync(path.join(tempTimelineDir, `event-${ev.id}.json`), JSON.stringify(ev, null, 2), 'utf-8');
      }
    }
    
    // 3. Swap / replace target files and folders
    
    // A. Restore workspace config manifest (if not preset)
    if (!isPreset && rootPath) {
      const configPath = path.join(rootPath, '.agentdeck', 'workspace.json');
      if (fs.existsSync(path.join(tempRestoreDir, 'workspace.json'))) {
        fs.copyFileSync(path.join(tempRestoreDir, 'workspace.json'), configPath);
      }
    }
    
    // B. Replace Governance directory files
    if (!fs.existsSync(govDir)) fs.mkdirSync(govDir, { recursive: true });
    fs.copyFileSync(path.join(tempGovDir, 'policies.json'), path.join(govDir, 'policies.json'));
    fs.copyFileSync(path.join(tempGovDir, 'release_candidates.json'), path.join(govDir, 'release_candidates.json'));
    
    // C. Replace Evals files and directories
    if (!fs.existsSync(evalsDir)) fs.mkdirSync(evalsDir, { recursive: true });
    fs.copyFileSync(path.join(tempEvalsDir, 'benchmarks.json'), path.join(evalsDir, 'benchmarks.json'));
    fs.copyFileSync(path.join(tempEvalsDir, 'judges.json'), path.join(evalsDir, 'judges.json'));
    fs.copyFileSync(path.join(tempEvalsDir, 'promotions.json'), path.join(evalsDir, 'promotions.json'));
    fs.copyFileSync(path.join(tempEvalsDir, 'regression_runs.json'), path.join(evalsDir, 'regression_runs.json'));
    
    // Swap failures folder
    const destFailuresDir = path.join(evalsDir, 'failures');
    if (fs.existsSync(destFailuresDir)) fs.rmSync(destFailuresDir, { recursive: true, force: true });
    if (fs.existsSync(tempFailuresDir)) {
      fs.cpSync(tempFailuresDir, destFailuresDir, { recursive: true });
    } else {
      fs.mkdirSync(destFailuresDir, { recursive: true });
    }
    
    // Swap gold standards folder
    const destGoldStandardsDir = path.join(evalsDir, 'gold-standards');
    if (fs.existsSync(destGoldStandardsDir)) fs.rmSync(destGoldStandardsDir, { recursive: true, force: true });
    if (fs.existsSync(tempGoldStandardsDir)) {
      fs.cpSync(tempGoldStandardsDir, destGoldStandardsDir, { recursive: true });
    } else {
      fs.mkdirSync(destGoldStandardsDir, { recursive: true });
    }
    
    // D. Swap timeline events folder
    if (fs.existsSync(timelineDir)) fs.rmSync(timelineDir, { recursive: true, force: true });
    if (fs.existsSync(tempTimelineDir)) {
      fs.cpSync(tempTimelineDir, timelineDir, { recursive: true });
    } else {
      fs.mkdirSync(timelineDir, { recursive: true });
    }
    
    // Cleanup temp directory
    fs.rmSync(tempRestoreDir, { recursive: true, force: true });
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to restore snapshot:', error);
    try {
      if (fs.existsSync(tempRestoreDir)) {
        fs.rmSync(tempRestoreDir, { recursive: true, force: true });
      }
    } catch (_) {}
    return { success: false, error: error.message };
  }
});

// --- Provenance Engine (extracted to ipc/provenanceHandlers.ts, W5 PR 6) ---
registerProvenanceHandlers({ ipcMain, getProvenancePath });

// Helper to run Workspace Doctor checks
async function runDoctorChecksInternal(rootPath: string | null, presetId: string): Promise<any> {
  const checks: any[] = [];
  const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
  
  // 1. Folders exist check
  let baseExists = false;
  const missingDirs: string[] = [];
  
  if (PRESET_IDS.includes(presetId)) {
    const baseDir = path.join(DATA_DIR, 'presets-evals', presetId);
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
        const baseDir = path.join(DATA_DIR, 'presets-evals', presetId);
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
