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
import { registerDepHandlers } from './ipc/depHandlers';

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
// runDoctorChecksInternal + recordRemediationProvenance are returned here so the
// DEP domain (registered below) can consume them with unchanged signatures.
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

// --- Decision Evidence Packages (extracted to ipc/depHandlers.ts, W5 PR 12) ---
registerDepHandlers({
  ipcMain,
  dialog,
  BrowserWindow,
  getDecisionsDir,
  getProvenancePath,
  getEvalsDir,
  getGovernanceDir,
  getSnapshotsDir,
  runDoctorChecksInternal,
  recordRemediationProvenance,
});

