import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { TerminalManager } from './terminalManager';
import { approveCommand } from './commandSafety';
import { processManager } from './processManager';
import { spawn } from 'child_process';
import { setLogWindow, addSystemLogInternal } from './logger';
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
import { registerSafetyHandlers } from './ipc/safetyHandlers';
import { registerWorkspaceHandlers } from './ipc/workspaceHandlers';

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

// --- Safety Approval Gate (extracted to ipc/safetyHandlers.ts, W5.1) ---
registerSafetyHandlers({ ipcMain, approveCommand });

// --- Terminals (extracted to ipc/terminalHandlers.ts, W5 PR 2) ---
registerTerminalHandlers({ ipcMain, terminalManager });

// --- Workspace domain (extracted to ipc/workspaceHandlers.ts, W5.1) ---
registerWorkspaceHandlers({ ipcMain, workspacesDir: WORKSPACES_DIR, addSystemLogInternal });

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

