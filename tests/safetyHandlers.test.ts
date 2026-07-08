import { describe, it, expect, vi } from 'vitest';
import { registerSafetyHandlers } from '../electron/ipc/safetyHandlers';

// Covers the W5.1 extraction: registerSafetyHandlers wires safety:approve via
// ipcMain.handle and delegates to the injected approveCommand, returning true.

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

describe('registerSafetyHandlers', () => {
  it('registers exactly safety:approve, via ipcMain.handle', () => {
    const ipc = makeFakeIpcMain();
    registerSafetyHandlers({ ipcMain: ipc as any, approveCommand: vi.fn() });
    expect(ipc.channels()).toEqual(['safety:approve']);
    expect(ipc.styleOf('safety:approve')).toBe('handle');
  });

  it('delegates to approveCommand(command) and returns true', async () => {
    const ipc = makeFakeIpcMain();
    const approveCommand = vi.fn();
    registerSafetyHandlers({ ipcMain: ipc as any, approveCommand });
    const result = await ipc.invoke('safety:approve', 'rm -rf ./build');
    expect(approveCommand).toHaveBeenCalledWith('rm -rf ./build');
    expect(result).toBe(true);
  });
});
