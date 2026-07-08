import { describe, it, expect, vi } from 'vitest';
import { registerTerminalHandlers } from '../electron/ipc/terminalHandlers';

// Covers the W5 PR 2 extraction: registerTerminalHandlers wires the four
// terminal:* channels to the correct terminalManager methods with correct
// args, AND preserves the exact registration STYLE (create/kill = .handle,
// write/resize = .on) -- the block must not be normalized to one style.

function makeFakeIpcMain() {
  const handlers = new Map<string, { style: 'handle' | 'on'; fn: (...args: any[]) => any }>();
  return {
    handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, { style: 'handle', fn }),
    on: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, { style: 'on', fn }),
    invoke: (channel: string, ...args: any[]) => handlers.get(channel)!.fn(null, ...args),
    styleOf: (channel: string) => handlers.get(channel)?.style,
    channels: () => [...handlers.keys()],
  };
}

function setup() {
  const ipc = makeFakeIpcMain();
  const terminalManager = {
    createTerminal: vi.fn(() => ({ id: 'term-1', type: 'node-pty' })),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  registerTerminalHandlers({ ipcMain: ipc as any, terminalManager: terminalManager as any });
  return { ipc, terminalManager };
}

describe('registerTerminalHandlers', () => {
  it('registers exactly the four terminal channels', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual(['terminal:create', 'terminal:kill', 'terminal:resize', 'terminal:write']);
  });

  it('preserves registration styles: create/kill = handle, write/resize = on', () => {
    const { ipc } = setup();
    expect(ipc.styleOf('terminal:create')).toBe('handle');
    expect(ipc.styleOf('terminal:kill')).toBe('handle');
    expect(ipc.styleOf('terminal:write')).toBe('on');
    expect(ipc.styleOf('terminal:resize')).toBe('on');
  });

  it('terminal:create forwards id/shell/args/cwd/cols/rows and returns the manager result', async () => {
    const { ipc, terminalManager } = setup();
    const result = await ipc.invoke('terminal:create', { id: 't1', shell: 'powershell.exe', args: ['-NoLogo'], cwd: 'C:/ws', cols: 80, rows: 24 });
    expect(terminalManager.createTerminal).toHaveBeenCalledWith('t1', 'powershell.exe', ['-NoLogo'], 'C:/ws', 80, 24);
    expect(result).toEqual({ id: 'term-1', type: 'node-pty' });
  });

  it('terminal:write forwards id + data to terminalManager.write', () => {
    const { ipc, terminalManager } = setup();
    ipc.invoke('terminal:write', { id: 't1', data: 'ls\r' });
    expect(terminalManager.write).toHaveBeenCalledWith('t1', 'ls\r');
  });

  it('terminal:resize forwards id + cols + rows to terminalManager.resize', () => {
    const { ipc, terminalManager } = setup();
    ipc.invoke('terminal:resize', { id: 't1', cols: 120, rows: 40 });
    expect(terminalManager.resize).toHaveBeenCalledWith('t1', 120, 40);
  });

  it('terminal:kill forwards id to terminalManager.kill and returns true', async () => {
    const { ipc, terminalManager } = setup();
    const result = await ipc.invoke('terminal:kill', 't1');
    expect(terminalManager.kill).toHaveBeenCalledWith('t1');
    expect(result).toBe(true);
  });
});
