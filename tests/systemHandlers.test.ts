import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { registerSystemHandlers } from '../electron/ipc/systemHandlers';

// Covers the W5 PR 4 extraction: registerSystemHandlers wires the ten thin
// system/misc channels, each via ipcMain.handle, preserving channel names,
// payload/return shapes, file paths, persisted formats, and error handling.
// All external effects (fs, dialog, window, fetch) are faked/mocked -- no real
// dialog, Ollama, port, or disk writes occur.

const WORKSPACES_DIR = '/fake/workspaces';
const DATA_DIR = '/fake/data';

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

function setup(overrides: Partial<{
  dialog: any;
  BrowserWindow: any;
  getMainWindow: () => any;
}> = {}) {
  const ipc = makeFakeIpcMain();
  const dialog = overrides.dialog ?? { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) };
  const BrowserWindow = overrides.BrowserWindow ?? { getFocusedWindow: vi.fn(() => null) };
  const getMainWindow = overrides.getMainWindow ?? (() => null);
  const addSystemLogInternal = vi.fn((message: string) => ({ id: 'log-1', message }));
  registerSystemHandlers({
    ipcMain: ipc as any,
    dialog: dialog as any,
    BrowserWindow: BrowserWindow as any,
    getMainWindow: getMainWindow as any,
    workspacesDir: WORKSPACES_DIR,
    dataDir: DATA_DIR,
    addSystemLogInternal: addSystemLogInternal as any,
  });
  return { ipc, dialog, BrowserWindow, getMainWindow, addSystemLogInternal };
}

const ALL_CHANNELS = [
  'workspaces:load-all', 'workspaces:load',
  'layout:load', 'layout:save',
  'logs:load', 'logs:save', 'logs:add',
  'ollama:check-status',
  'dialog:open-directory',
  'port:check-health',
];

describe('registerSystemHandlers — registration', () => {
  it('registers exactly the ten system/misc channels', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual([...ALL_CHANNELS].sort());
  });

  it('every channel uses ipcMain.handle (no .on handlers in this domain)', () => {
    const { ipc } = setup();
    for (const ch of ALL_CHANNELS) {
      expect(ipc.styleOf(ch)).toBe('handle');
    }
  });

  it('does NOT register heavier workspace-domain or out-of-scope channels', () => {
    const { ipc } = setup();
    const registered = ipc.channels();
    for (const ch of ['workspace:load-path', 'workspace:save', 'workspace:initialize', 'safety:approve', 'terminal:create']) {
      expect(registered).not.toContain(ch);
    }
  });
});

describe('workspaces:load-all / workspaces:load', () => {
  afterEach(() => vi.restoreAllMocks());

  it('load-all reads WORKSPACES_DIR, parses each .json, skips non-json', async () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['a.json', 'notes.txt', 'b.json'] as any);
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) =>
      String(p).includes('a.json') ? '{"id":"a"}' : '{"id":"b"}'
    );
    const { ipc } = setup();
    const result = await ipc.invoke('workspaces:load-all');
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('load-all returns [] when the directory read throws', async () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('ENOENT'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ipc } = setup();
    expect(await ipc.invoke('workspaces:load-all')).toEqual([]);
  });

  it('load-all skips a single corrupt file but returns the rest', async () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['good.json', 'bad.json'] as any);
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) =>
      String(p).includes('good') ? '{"id":"good"}' : '{ not json'
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ipc } = setup();
    expect(await ipc.invoke('workspaces:load-all')).toEqual([{ id: 'good' }]);
  });

  it('load returns parsed workspace when the file exists', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"id":"tm4"}' as any);
    const { ipc } = setup();
    expect(await ipc.invoke('workspaces:load', 'tm4')).toEqual({ id: 'tm4' });
  });

  it('load returns null when the file is absent', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { ipc } = setup();
    expect(await ipc.invoke('workspaces:load', 'missing')).toBeNull();
  });
});

describe('layout:load / layout:save', () => {
  afterEach(() => vi.restoreAllMocks());

  it('load returns the persisted layout when present', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"sidebarWidth":300}' as any);
    const { ipc } = setup();
    expect(await ipc.invoke('layout:load')).toEqual({ sidebarWidth: 300 });
  });

  it('load returns the exact default shape when the file is absent', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { ipc } = setup();
    expect(await ipc.invoke('layout:load')).toEqual({
      activeWorkspaceId: 'tm4', sidebarWidth: 210, activeTerminalTabId: null, terminalWidthPercent: 50, logsHeightPercent: 22,
    });
  });

  it('save writes pretty JSON to data/layout.json and returns true', async () => {
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const { ipc } = setup();
    const result = await ipc.invoke('layout:save', { sidebarWidth: 250 });
    expect(result).toBe(true);
    const [pathArg, contentArg, encArg] = write.mock.calls[0];
    expect(String(pathArg).replace(/\\/g, '/')).toBe('/fake/data/layout.json');
    expect(contentArg).toBe(JSON.stringify({ sidebarWidth: 250 }, null, 2));
    expect(encArg).toBe('utf-8');
  });

  it('save returns false when the write throws', async () => {
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('EACCES'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ipc } = setup();
    expect(await ipc.invoke('layout:save', {})).toBe(false);
  });
});

describe('logs:load / logs:save / logs:add', () => {
  afterEach(() => vi.restoreAllMocks());

  it('load returns [] when absent, parsed array when present', async () => {
    const existsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { ipc } = setup();
    expect(await ipc.invoke('logs:load')).toEqual([]);
    existsSync.mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[{"message":"hi"}]' as any);
    expect(await ipc.invoke('logs:load')).toEqual([{ message: 'hi' }]);
  });

  it('save writes to data/logs.json and returns true', async () => {
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const { ipc } = setup();
    expect(await ipc.invoke('logs:save', [{ message: 'a' }])).toBe(true);
    expect(String(write.mock.calls[0][0]).replace(/\\/g, '/')).toBe('/fake/data/logs.json');
  });

  it('add delegates to addSystemLogInternal with message/type/workspaceId and returns its result', async () => {
    const { ipc, addSystemLogInternal } = setup();
    const result = await ipc.invoke('logs:add', { message: 'boot', type: 'success', workspaceId: 'tm4' });
    expect(addSystemLogInternal).toHaveBeenCalledWith('boot', 'success', 'tm4');
    expect(result).toEqual({ id: 'log-1', message: 'boot' });
  });
});

describe('ollama:check-status (fetch mocked; no real Ollama)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('returns running:true with model names on a healthy response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3' }, { name: 'qwen' }] }),
    })));
    const { ipc } = setup();
    expect(await ipc.invoke('ollama:check-status')).toEqual({ running: true, models: ['llama3', 'qwen'] });
  });

  it('returns running:false, models:[] on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const { ipc } = setup();
    expect(await ipc.invoke('ollama:check-status')).toEqual({ running: false, models: [] });
  });

  it('returns running:false, models:[] when fetch rejects (connection refused)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const { ipc } = setup();
    expect(await ipc.invoke('ollama:check-status')).toEqual({ running: false, models: [] });
  });
});

describe('dialog:open-directory (dialog + window mocked; no real dialog)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the chosen path, scoped to the focused window when present', async () => {
    const focused = { id: 'focused' };
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:\\picked'] })) };
    const BrowserWindow = { getFocusedWindow: vi.fn(() => focused) };
    const { ipc } = setup({ dialog, BrowserWindow });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await ipc.invoke('dialog:open-directory');
    expect(result).toBe('C:\\picked');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(focused, { properties: ['openDirectory'] });
  });

  it('falls back to getMainWindow() when no window is focused', async () => {
    const main = { id: 'main' };
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:\\p'] })) };
    const BrowserWindow = { getFocusedWindow: vi.fn(() => null) };
    const { ipc } = setup({ dialog, BrowserWindow, getMainWindow: () => main });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await ipc.invoke('dialog:open-directory');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(main, { properties: ['openDirectory'] });
  });

  it('calls the windowless overload when neither focused nor main window exists', async () => {
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) };
    const BrowserWindow = { getFocusedWindow: vi.fn(() => null) };
    const { ipc } = setup({ dialog, BrowserWindow, getMainWindow: () => null });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await ipc.invoke('dialog:open-directory');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({ properties: ['openDirectory'] });
  });

  it('returns null when the dialog is canceled', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { ipc } = setup(); // default dialog is canceled
    expect(await ipc.invoke('dialog:open-directory')).toBeNull();
  });

  it('returns null when showOpenDialog throws', async () => {
    const dialog = { showOpenDialog: vi.fn(async () => { throw new Error('dialog boom'); }) };
    const BrowserWindow = { getFocusedWindow: vi.fn(() => null) };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ipc } = setup({ dialog, BrowserWindow });
    expect(await ipc.invoke('dialog:open-directory')).toBeNull();
  });
});

describe('port:check-health (fetch mocked; no real port)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('online:true when the response is ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    const { ipc } = setup();
    expect(await ipc.invoke('port:check-health', 'http://localhost:3000')).toEqual({ online: true });
  });

  it('online:true for a 4xx (status < 500 counts as reachable)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const { ipc } = setup();
    expect(await ipc.invoke('port:check-health', 'http://localhost:3000')).toEqual({ online: true });
  });

  it('online:false for a 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    const { ipc } = setup();
    expect(await ipc.invoke('port:check-health', 'http://localhost:3000')).toEqual({ online: false });
  });

  it('online:false when fetch rejects/aborts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('aborted'); }));
    const { ipc } = setup();
    expect(await ipc.invoke('port:check-health', 'http://localhost:3000')).toEqual({ online: false });
  });
});
