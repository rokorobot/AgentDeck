import type { IpcMain } from 'electron';
import type { TerminalManager } from '../terminalManager';

/**
 * Terminal IPC handlers (terminal:create / write / resize / kill).
 *
 * Extracted verbatim from electron/main.ts (audit W5 PR 2) as a behavior-
 * preserving relocation. Registration STYLES are preserved exactly:
 * create/kill use ipcMain.handle (they return a value), write/resize use
 * ipcMain.on (fire-and-forget input/geometry events). This block references
 * only terminalManager -- it does not read mainWindow -- so no getMainWindow
 * dependency is needed here.
 */
export interface TerminalHandlerDeps {
  ipcMain: IpcMain;
  terminalManager: TerminalManager;
}

export function registerTerminalHandlers(deps: TerminalHandlerDeps): void {
  const { ipcMain, terminalManager } = deps;

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
}
