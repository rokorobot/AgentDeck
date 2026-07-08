import type { IpcMain } from 'electron';

/**
 * Safety-approval IPC handler (safety:approve). Relocated verbatim from
 * electron/main.ts (W5.1) as a behavior-preserving change. `approveCommand`
 * (electron/commandSafety) is injected; the handler body is unchanged.
 * A distinct one-handler module (kept separate from workspaceHandlers) to
 * preserve the per-domain convention established across W5.
 */
export interface SafetyHandlerDeps {
  ipcMain: IpcMain;
  approveCommand: (command: string) => void;
}

export function registerSafetyHandlers(deps: SafetyHandlerDeps): void {
  const { ipcMain, approveCommand } = deps;

  ipcMain.handle('safety:approve', async (_event, command: string) => {
    approveCommand(command);
    return true;
  });
}
