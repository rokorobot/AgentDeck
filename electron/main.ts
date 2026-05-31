import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { TerminalManager } from './terminalManager';
import { approveCommand } from './commandSafety';
import { processManager } from './processManager';
import { exec } from 'child_process';
import { setLogWindow, addSystemLogInternal } from './logger';
import { validateManifest } from '../src/lib/manifestValidation';

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
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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

// --- Workspaces ---
ipcMain.handle('workspaces:load-all', async () => {
  try {
    const files = fs.readdirSync(WORKSPACES_DIR);
    const workspaces = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(WORKSPACES_DIR, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          workspaces.push(JSON.parse(data));
        } catch (e) {
          console.error(`Error parsing workspace file ${file}:`, e);
        }
      }
    }
    return workspaces;
  } catch (error) {
    console.error('Failed to read workspaces:', error);
    return [];
  }
});

ipcMain.handle('workspaces:load', async (_event, id: string) => {
  try {
    const filePath = path.join(WORKSPACES_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
    return null;
  } catch (error) {
    console.error(`Failed to load workspace ${id}:`, error);
    return null;
  }
});

// --- Layout ---
ipcMain.handle('layout:load', async () => {
  const filePath = path.join(DATA_DIR, 'layout.json');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load layout:', error);
  }
  return { activeWorkspaceId: 'tm4', sidebarWidth: 210, activeTerminalTabId: null, terminalWidthPercent: 50, logsHeightPercent: 22 };
});

ipcMain.handle('layout:save', async (_event, layout: any) => {
  const filePath = path.join(DATA_DIR, 'layout.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(layout, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save layout:', error);
    return false;
  }
});

// --- Logs ---
ipcMain.handle('logs:load', async () => {
  const filePath = path.join(DATA_DIR, 'logs.json');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
  return [];
});

ipcMain.handle('logs:save', async (_event, logs: any[]) => {
  const filePath = path.join(DATA_DIR, 'logs.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save logs:', error);
    return false;
  }
});


ipcMain.handle('logs:add', async (_event, logEntry: any) => {
  return addSystemLogInternal(logEntry.message, logEntry.type, logEntry.workspaceId);
});

// --- Ollama API check ---
ipcMain.handle('ollama:check-status', async () => {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    if (!response.ok) {
      return { running: false, models: [] };
    }
    const data = (await response.json()) as { models: Array<{ name: string }> };
    const models = data.models ? data.models.map((m) => m.name) : [];
    return { running: true, models };
  } catch (error) {
    // If connection gets refused, Ollama is not running locally
    return { running: false, models: [] };
  }
});

// --- Safety Approval Gate ---
ipcMain.handle('safety:approve', async (_event, command: string) => {
  approveCommand(command);
  return true;
});

// --- Terminals ---
ipcMain.handle('terminal:create', async (_event, { id, shell, args, cwd, cols, rows }) => {
  return terminalManager.createTerminal(id, shell, args, cwd, cols, rows);
});

ipcMain.on('terminal:write', (_event, { id, data }) => {
  terminalManager.write(id, data);
});

ipcMain.on('terminal:resize', (_event, { id, cols, rows }) => {
  terminalManager.resize(id, cols, rows);
});

ipcMain.handle('terminal:kill', async (_event, id: string) => {
  terminalManager.kill(id);
  return true;
});

// --- Native Folder Dialog ---
ipcMain.handle('dialog:open-directory', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

// --- Dynamic Workspace Loader (.agentdeck/workspace.json) ---
ipcMain.handle('workspace:load-path', async (_event, folderPath: string) => {
  try {
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
    const configPath = path.join(folderPath, '.agentdeck', 'workspace.json');
    return { exists: fs.existsSync(configPath) };
  } catch (e) {
    console.error(e);
    return { exists: false };
  }
});

ipcMain.handle('workspace:initialize', async (_event, { folderPath, name, previewUrl, templateId }) => {
  try {
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
    if (rootPath) {
      // Dynamic discovered workspace
      configPath = path.join(rootPath, '.agentdeck', 'workspace.json');
    } else {
      // Presets are read-only
      return { success: false, error: 'Built-in presets are read-only.' };
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

// --- Port Health Ping ---
ipcMain.handle('port:check-health', async (_event, url: string) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return { online: response.ok || response.status < 500 };
  } catch {
    return { online: false };
  }
});

// --- Managed Process Controls ---
ipcMain.handle('process:start', async (_event, { workspaceId, command, cwd }) => {
  if (!mainWindow) return null;
  return await processManager.startProcess(workspaceId, command, cwd, terminalManager, mainWindow);
});

ipcMain.handle('process:stop', async (_event, runId) => {
  if (!mainWindow) return false;
  return await processManager.stopProcess(runId, terminalManager, mainWindow);
});

ipcMain.handle('process:restart', async (_event, runId) => {
  if (!mainWindow) return null;
  return await processManager.restartProcess(runId, terminalManager, mainWindow);
});

ipcMain.handle('process:list', async () => {
  return processManager.getProcesses();
});

// --- Resilient IDE Launcher ---
ipcMain.handle('ide:open', async (_event, { ide, folderPath }) => {
  let cmd = '';
  
  if (ide === 'vscode') {
    cmd = `code "${folderPath}"`;
  } else if (ide === 'cursor') {
    cmd = `cursor "${folderPath}"`;
  } else if (ide === 'folder') {
    cmd = `explorer "${folderPath}"`;
  } else if (ide === 'antigravity') {
    addSystemLogInternal(`IDE Open: Mock Antigravity agent opened folder scope "${folderPath}"`, 'success');
    return { success: true };
  } else {
    return { success: false, error: 'Unknown IDE target' };
  }

  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        console.warn(`[IDE Launcher] Open failed for "${ide}":`, err.message);
        addSystemLogInternal(`IDE Launcher Error: "${ide}" binary executable failed to run. Verify it is installed and configured in your system environment PATH variables.`, 'error');
        resolve({ success: false, error: err.message });
      } else {
        addSystemLogInternal(`IDE Open: Successfully opened "${folderPath}" in "${ide}"`, 'success');
        resolve({ success: true });
      }
    });
  });
});

// Helper to get evaluation directory
function getEvalsDir(rootPath: string | null, presetId: string): string {
  const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
  if (PRESET_IDS.includes(presetId)) {
    return path.join(DATA_DIR, 'presets-evals', presetId);
  }
  if (rootPath && fs.existsSync(rootPath)) {
    return path.join(rootPath, '.agentdeck', 'evals');
  } else {
    return path.join(DATA_DIR, 'presets-evals', presetId);
  }
}

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
    const filePath = path.join(failuresDir, `failure-${failure.id}.json`);
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
    const filePath = path.join(evalsDir, 'failures', `failure-${failureId}.json`);
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
    const filePath = path.join(goldStandardsDir, `gold-${item.id}.json`);
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
    const filePath = path.join(evalsDir, 'gold-standards', `gold-${id}.json`);
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
function getTimelineDir(rootPath: string | null, presetId: string): string {
  const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
  if (PRESET_IDS.includes(presetId)) {
    return path.join(DATA_DIR, 'presets-evals', presetId, 'timeline');
  }
  if (rootPath && fs.existsSync(rootPath)) {
    return path.join(rootPath, '.agentdeck', 'timeline');
  } else {
    return path.join(DATA_DIR, 'presets-evals', presetId, 'timeline');
  }
}

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
      const defaultEvents = [];
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
          events.push(JSON.parse(content));
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
    const filePath = path.join(timelineDir, `event-${event.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(event, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save timeline event:', error);
    return false;
  }
});

// Helper to get governance directory
function getGovernanceDir(rootPath: string | null, presetId: string): string {
  const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
  if (PRESET_IDS.includes(presetId)) {
    return path.join(DATA_DIR, 'presets-evals', presetId, 'governance');
  }
  if (rootPath && fs.existsSync(rootPath)) {
    return path.join(rootPath, '.agentdeck', 'governance');
  } else {
    return path.join(DATA_DIR, 'presets-evals', presetId, 'governance');
  }
}

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
      fs.writeFileSync(policiesPath, JSON.stringify(policies, null, 2), 'utf-8');
    }
    
    // Load or seed release candidates
    if (fs.existsSync(candidatesPath)) {
      releaseCandidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
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
    const filePath = path.join(govDir, 'release_candidates.json');
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save release candidates list:', error);
    return false;
  }
});


