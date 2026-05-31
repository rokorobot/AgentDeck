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
