import type { IpcMain, Shell } from 'electron';
import type { spawn as spawnFn } from 'child_process';
import fs from 'fs';
import { buildIdeOpenCommand, resolveExecutableOnPath, findEditorExecutable, IdeLaunchSpec } from '../../src/lib/ideLauncher';
import type { addSystemLogInternal as addSystemLogFn } from '../logger';

/**
 * IDE IPC handler (ide:open) and its editor-resolution helper.
 *
 * Extracted verbatim from electron/main.ts (audit W5 PR 3) as a behavior-
 * preserving relocation. The handler references shell.openPath, spawn and
 * addSystemLogInternal -- injected here so tests can observe launches without
 * spawning real applications -- but never mainWindow, so no getMainWindow
 * dependency is needed. The pure ideLauncher helpers are imported directly,
 * exactly as main.ts imported them.
 */
export interface IdeHandlerDeps {
  ipcMain: IpcMain;
  shell: Shell;
  spawn: typeof spawnFn;
  addSystemLogInternal: typeof addSystemLogFn;
}

// Resolve the concrete image to spawn. On Windows the PATH entry for editors is a
// `.cmd` shim that cannot be spawned without a shell, so we locate the real .exe
// beside it; elsewhere the PATH entry is directly executable.
export function resolveEditorTarget(spec: IdeLaunchSpec): string | null {
  if (process.platform !== 'win32' || !spec.windowsExeName) {
    return spec.command;
  }
  const shim = resolveExecutableOnPath(spec.command, {
    pathValue: process.env.PATH || process.env.Path || '',
    pathext: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
    fileExists: fs.existsSync,
  });
  if (!shim) return null;
  return findEditorExecutable(shim, spec.windowsExeName, fs.existsSync);
}

export function registerIdeHandlers(deps: IdeHandlerDeps): void {
  const { ipcMain, shell, spawn, addSystemLogInternal } = deps;

  ipcMain.handle('ide:open', async (_event, { ide, folderPath }) => {
    if (typeof folderPath !== 'string' || !folderPath.trim()) {
      return { success: false, error: 'A valid folder path is required.' };
    }

    // Mock target: no process is launched.
    if (ide === 'antigravity') {
      addSystemLogInternal(`IDE Open: Mock Antigravity agent opened folder scope "${folderPath}"`, 'success');
      return { success: true };
    }

    // Folder/Explorer: use the OS opener directly (no shell, correct exit semantics).
    if (ide === 'folder') {
      const openErr = await shell.openPath(folderPath);
      if (openErr) {
        addSystemLogInternal(`IDE Launcher Error: failed to open folder "${folderPath}": ${openErr}`, 'error');
        return { success: false, error: openErr };
      }
      addSystemLogInternal(`IDE Open: Successfully opened "${folderPath}" in "folder"`, 'success');
      return { success: true };
    }

    // Editors: spawn the real executable with folderPath as a single literal argv
    // entry. shell:false guarantees shell metacharacters in the path are never
    // interpreted as syntax.
    const spec = buildIdeOpenCommand(ide, folderPath);
    if (!spec) {
      return { success: false, error: 'Unknown IDE target' };
    }

    const target = resolveEditorTarget(spec);
    if (!target) {
      const msg = `IDE Launcher Error: "${ide}" executable could not be located on your system PATH. Verify it is installed.`;
      addSystemLogInternal(msg, 'error');
      return { success: false, error: msg };
    }

    return new Promise((resolve) => {
      let settled = false;
      const child = spawn(target, spec.args, {
        shell: false,
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        console.warn(`[IDE Launcher] Open failed for "${ide}":`, err.message);
        addSystemLogInternal(`IDE Launcher Error: "${ide}" binary executable failed to run. Verify it is installed and configured in your system environment PATH variables.`, 'error');
        resolve({ success: false, error: err.message });
      });
      child.on('spawn', () => {
        if (settled) return;
        settled = true;
        child.unref();
        addSystemLogInternal(`IDE Open: Successfully opened "${folderPath}" in "${ide}"`, 'success');
        resolve({ success: true });
      });
    });
  });
}
