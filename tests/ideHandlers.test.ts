import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { registerIdeHandlers, resolveEditorTarget } from '../electron/ipc/ideHandlers';

// Covers the W5 PR 3 extraction: registerIdeHandlers wires ide:open (and only
// ide:open) via ipcMain.handle, and the relocated handler preserves every
// behavior branch verbatim -- input validation, the antigravity mock, the
// folder/shell.openPath path, unknown-IDE rejection, PATH-resolution failure,
// and the spawn success/error settlement. shell and spawn are injected fakes,
// so no real application is ever launched.

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

function makeFakeChild() {
  const listeners = new Map<string, (...args: any[]) => void>();
  return {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => listeners.set(event, cb)),
    unref: vi.fn(),
    emit: (event: string, ...args: any[]) => listeners.get(event)?.(...args),
  };
}

function setup(opts: { openPathResult?: string } = {}) {
  const ipc = makeFakeIpcMain();
  const shell = { openPath: vi.fn(async () => opts.openPathResult ?? '') };
  let lastChild: ReturnType<typeof makeFakeChild> | null = null;
  const spawn = vi.fn(() => {
    lastChild = makeFakeChild();
    return lastChild;
  });
  const addSystemLogInternal = vi.fn();
  registerIdeHandlers({
    ipcMain: ipc as any,
    shell: shell as any,
    spawn: spawn as any,
    addSystemLogInternal: addSystemLogInternal as any,
  });
  return { ipc, shell, spawn, addSystemLogInternal, getChild: () => lastChild };
}

describe('registerIdeHandlers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('registers exactly ide:open, via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels()).toEqual(['ide:open']);
    expect(ipc.styleOf('ide:open')).toBe('handle');
  });

  it('rejects a missing/blank folderPath without launching anything', async () => {
    const { ipc, shell, spawn } = setup();
    for (const folderPath of [undefined, '', '   ', 42]) {
      const result = await ipc.invoke('ide:open', { ide: 'vscode', folderPath });
      expect(result).toEqual({ success: false, error: 'A valid folder path is required.' });
    }
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('antigravity is a mock: succeeds, logs, launches nothing', async () => {
    const { ipc, shell, spawn, addSystemLogInternal } = setup();
    const result = await ipc.invoke('ide:open', { ide: 'antigravity', folderPath: 'C:\\ws' });
    expect(result).toEqual({ success: true });
    expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('Mock Antigravity'), 'success');
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('folder delegates to shell.openPath and succeeds when it returns ""', async () => {
    const { ipc, shell, spawn, addSystemLogInternal } = setup();
    const result = await ipc.invoke('ide:open', { ide: 'folder', folderPath: 'C:\\ws' });
    expect(shell.openPath).toHaveBeenCalledWith('C:\\ws');
    expect(result).toEqual({ success: true });
    expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('Successfully opened'), 'success');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('folder surfaces the shell.openPath error string as the failure', async () => {
    const { ipc, addSystemLogInternal } = setup({ openPathResult: 'Access is denied.' });
    const result = await ipc.invoke('ide:open', { ide: 'folder', folderPath: 'C:\\ws' });
    expect(result).toEqual({ success: false, error: 'Access is denied.' });
    expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('failed to open folder'), 'error');
  });

  it('unknown IDE targets are rejected without launching anything', async () => {
    const { ipc, shell, spawn } = setup();
    const result = await ipc.invoke('ide:open', { ide: 'emacs-web-3000', folderPath: 'C:\\ws' });
    expect(result).toEqual({ success: false, error: 'Unknown IDE target' });
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  describe('editor spawn paths (existsSync stubbed; nothing real launched)', () => {
    beforeEach(() => {
      // Make PATH resolution deterministic: every candidate "exists", so the
      // shim resolves to <first PATH dir>\code and the exe beside it.
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    });

    it('spawns the resolved target with [folderPath] argv, shell:false, and settles success on "spawn"', async () => {
      const { ipc, spawn, addSystemLogInternal, getChild } = setup();
      const pending = ipc.invoke('ide:open', { ide: 'vscode', folderPath: 'C:\\ws with space' });
      expect(spawn).toHaveBeenCalledTimes(1);
      const [target, args, options] = (spawn as any).mock.calls[0];
      expect(typeof target).toBe('string');
      expect(args).toEqual(['C:\\ws with space']);
      expect(options).toEqual({ shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
      getChild()!.emit('spawn');
      await expect(pending).resolves.toEqual({ success: true });
      expect(getChild()!.unref).toHaveBeenCalled();
      expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('Successfully opened'), 'success');
    });

    it('settles failure with the error message on child "error"', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { ipc, addSystemLogInternal, getChild } = setup();
      const pending = ipc.invoke('ide:open', { ide: 'cursor', folderPath: 'C:\\ws' });
      getChild()!.emit('error', new Error('ENOENT'));
      await expect(pending).resolves.toEqual({ success: false, error: 'ENOENT' });
      expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('failed to run'), 'error');
    });

    it('settles only once even if both events fire', async () => {
      const { ipc, getChild } = setup();
      const pending = ipc.invoke('ide:open', { ide: 'vscode', folderPath: 'C:\\ws' });
      getChild()!.emit('spawn');
      getChild()!.emit('error', new Error('late'));
      await expect(pending).resolves.toEqual({ success: true });
    });
  });

  it.runIf(process.platform === 'win32')('fails cleanly when the editor is not on PATH (win32)', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { ipc, spawn, addSystemLogInternal } = setup();
    const result = await ipc.invoke('ide:open', { ide: 'vscode', folderPath: 'C:\\ws' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('could not be located');
    expect(spawn).not.toHaveBeenCalled();
    expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('could not be located'), 'error');
  });
});

describe('resolveEditorTarget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns spec.command unchanged when no windowsExeName is set', () => {
    expect(resolveEditorTarget({ command: 'code', args: ['C:\\ws'] })).toBe('code');
  });

  it.runIf(process.platform === 'win32')('resolves the real exe beside the PATH shim (win32)', () => {
    const shimDir = 'C:\\fake\\vscode\\bin';
    // Case-insensitive like NTFS: the PATHEXT candidate is "code.CMD".
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const lower = String(p).toLowerCase();
      return lower === path.join(shimDir, 'code.cmd').toLowerCase()
        || lower === path.join(shimDir, '..', 'Code.exe').toLowerCase();
    });
    const prevPath = process.env.PATH;
    const prevPathext = process.env.PATHEXT;
    process.env.PATH = shimDir;
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    try {
      const target = resolveEditorTarget({ command: 'code', args: ['C:\\ws'], windowsExeName: 'Code.exe' });
      expect(target).toBe(path.join(shimDir, '..', 'Code.exe'));
    } finally {
      process.env.PATH = prevPath;
      process.env.PATHEXT = prevPathext;
    }
  });

  it.runIf(process.platform === 'win32')('returns null when the shim is not on PATH (win32)', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const prevPath = process.env.PATH;
    process.env.PATH = 'C:\\fake\\empty';
    try {
      expect(resolveEditorTarget({ command: 'code', args: ['C:\\ws'], windowsExeName: 'Code.exe' })).toBeNull();
    } finally {
      process.env.PATH = prevPath;
    }
  });
});
