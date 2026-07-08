import type { IpcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import type { addSystemLogInternal as addSystemLogFn } from '../logger';

/**
 * System / misc IPC handlers -- the thin, self-contained boundary of
 * electron/main.ts (audit W5 PR 4). Extracted verbatim as a behavior-preserving
 * relocation:
 *
 *   workspaces:load-all / workspaces:load  (thin JSON readers of WORKSPACES_DIR;
 *     the heavier singular `workspace:*` domain is deliberately NOT moved here)
 *   layout:load / layout:save
 *   logs:load / logs:save / logs:add
 *   ollama:check-status
 *   dialog:open-directory
 *   port:check-health
 *
 * All bodies are unchanged except that the main.ts module-level constants
 * (WORKSPACES_DIR, DATA_DIR) and the reassigned `mainWindow` are now injected --
 * WORKSPACES_DIR/DATA_DIR as plain strings, and the window lazily via
 * getMainWindow() so a stale reference is never captured. `fs`/`path` are node
 * built-ins imported directly, exactly as main.ts used them. `fetch` remains the
 * process global (Ollama/port health), unchanged.
 */
export interface SystemHandlerDeps {
  ipcMain: IpcMain;
  dialog: typeof import('electron').dialog;
  BrowserWindow: typeof import('electron').BrowserWindow;
  getMainWindow: () => BrowserWindow | null;
  workspacesDir: string;
  dataDir: string;
  addSystemLogInternal: typeof addSystemLogFn;
}

export function registerSystemHandlers(deps: SystemHandlerDeps): void {
  const { ipcMain, dialog, BrowserWindow, getMainWindow, workspacesDir, dataDir, addSystemLogInternal } = deps;

  // --- Workspaces ---
  ipcMain.handle('workspaces:load-all', async () => {
    try {
      const files = fs.readdirSync(workspacesDir);
      const workspaces = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(workspacesDir, file);
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
      const filePath = path.join(workspacesDir, `${id}.json`);
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
    const filePath = path.join(dataDir, 'layout.json');
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
    const filePath = path.join(dataDir, 'layout.json');
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
    const filePath = path.join(dataDir, 'logs.json');
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
    const filePath = path.join(dataDir, 'logs.json');
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

  // --- Native Folder Dialog ---
  ipcMain.handle('dialog:open-directory', async () => {
    console.log('[Electron Main] dialog:open-directory IPC received');
    const win = BrowserWindow.getFocusedWindow() || getMainWindow();
    try {
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });
      console.log('[Electron Main] dialog:open-directory result:', result);
      if (result.canceled) {
        return null;
      } else {
        return result.filePaths[0];
      }
    } catch (error) {
      console.error('[Electron Main] Error showing open dialog:', error);
      return null;
    }
  });

  // --- Port Health ---
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
}
