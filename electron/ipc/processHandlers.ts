import type { BrowserWindow, IpcMain } from 'electron';
import type { TerminalManager } from '../terminalManager';

/**
 * Managed-process IPC handlers (process:start / stop / restart / list).
 *
 * Extracted verbatim from electron/main.ts (audit W5 PR 1) as a behavior-
 * preserving relocation -- the handler bodies are unchanged except that
 * `mainWindow` is now read lazily through getMainWindow(), because the window
 * is reassigned during creation and must not be captured as a stale value.
 * Dependencies are injected so the module has no hidden singletons of its own.
 */
export interface ProcessHandlerDeps {
  ipcMain: IpcMain;
  processManager: typeof import('../processManager').processManager;
  terminalManager: TerminalManager;
  getMainWindow: () => BrowserWindow | null;
}

export function registerProcessHandlers(deps: ProcessHandlerDeps): void {
  const { ipcMain, processManager, terminalManager, getMainWindow } = deps;

  ipcMain.handle('process:start', async (_event, { workspaceId, command, cwd }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    return await processManager.startProcess(workspaceId, command, cwd, terminalManager, mainWindow);
  });

  ipcMain.handle('process:stop', async (_event, runId) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return false;
    return await processManager.stopProcess(runId, terminalManager, mainWindow);
  });

  ipcMain.handle('process:restart', async (_event, runId) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    return await processManager.restartProcess(runId, terminalManager, mainWindow);
  });

  ipcMain.handle('process:list', async () => {
    return processManager.getProcesses();
  });
}
