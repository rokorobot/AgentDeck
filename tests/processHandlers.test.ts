import { describe, it, expect, vi } from 'vitest';
import { registerProcessHandlers } from '../electron/ipc/processHandlers';

// Covers the W5 PR 1 extraction: that registerProcessHandlers wires the four
// process:* channels to the correct processManager methods with the correct
// arguments, and that mainWindow is read LAZILY (so a window created after
// registration is still seen) with the original null-guard return values.

function makeFakeIpcMain() {
  const handlers = new Map<string, (...args: any[]) => any>();
  return {
    handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn),
    invoke: (channel: string, ...args: any[]) => handlers.get(channel)!(null, ...args),
    channels: () => [...handlers.keys()],
  };
}

function setup(initialWindow: any = { id: 'win' }) {
  const ipc = makeFakeIpcMain();
  const processManager = {
    startProcess: vi.fn(async () => ({ id: 'run-1' })),
    stopProcess: vi.fn(async () => true),
    restartProcess: vi.fn(async () => ({ id: 'run-2' })),
    getProcesses: vi.fn(() => [{ id: 'run-1' }]),
  };
  const terminalManager = { marker: 'tm' } as any;
  let currentWindow: any = initialWindow;
  registerProcessHandlers({
    ipcMain: ipc as any,
    processManager: processManager as any,
    terminalManager,
    getMainWindow: () => currentWindow,
  });
  return { ipc, processManager, terminalManager, setWindow: (w: any) => { currentWindow = w; } };
}

describe('registerProcessHandlers', () => {
  it('registers exactly the four process channels', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual(['process:list', 'process:restart', 'process:start', 'process:stop']);
  });

  it('process:start forwards workspaceId/command/cwd + terminalManager + window to startProcess', async () => {
    const win = { id: 'win' };
    const { ipc, processManager, terminalManager } = setup(win);
    const result = await ipc.invoke('process:start', { workspaceId: 'ws', command: { id: 'c' }, cwd: 'C:/ws' });
    expect(processManager.startProcess).toHaveBeenCalledWith('ws', { id: 'c' }, 'C:/ws', terminalManager, win);
    expect(result).toEqual({ id: 'run-1' });
  });

  it('process:stop and process:restart forward runId + terminalManager + window', async () => {
    const win = { id: 'win' };
    const { ipc, processManager, terminalManager } = setup(win);
    await ipc.invoke('process:stop', 'run-9');
    expect(processManager.stopProcess).toHaveBeenCalledWith('run-9', terminalManager, win);
    await ipc.invoke('process:restart', 'run-9');
    expect(processManager.restartProcess).toHaveBeenCalledWith('run-9', terminalManager, win);
  });

  it('process:list returns getProcesses() output', async () => {
    const { ipc, processManager } = setup();
    const result = await ipc.invoke('process:list');
    expect(processManager.getProcesses).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'run-1' }]);
  });

  it('preserves the original null-window guards (start->null, stop->false, restart->null)', async () => {
    const { ipc, processManager } = setup(null);
    expect(await ipc.invoke('process:start', { workspaceId: 'ws', command: {}, cwd: 'x' })).toBeNull();
    expect(await ipc.invoke('process:stop', 'run-1')).toBe(false);
    expect(await ipc.invoke('process:restart', 'run-1')).toBeNull();
    expect(processManager.startProcess).not.toHaveBeenCalled();
    expect(processManager.stopProcess).not.toHaveBeenCalled();
  });

  it('reads mainWindow lazily -- a window set AFTER registration is used', async () => {
    const { ipc, processManager, setWindow } = setup(null);
    // Registered while window was null; now a window appears (mirrors createWindow()).
    const win = { id: 'late-win' };
    setWindow(win);
    await ipc.invoke('process:start', { workspaceId: 'ws', command: {}, cwd: 'x' });
    expect(processManager.startProcess).toHaveBeenCalledWith('ws', {}, 'x', expect.anything(), win);
  });
});
