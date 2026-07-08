import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerWorkspaceHandlers } from '../electron/ipc/workspaceHandlers';

// Covers the W5.1 extraction: registerWorkspaceHandlers wires the five
// workspace:* channels (all ipcMain.handle) and preserves load/check/initialize
// (template wizard) / save (validate + timestamped backup + atomic write) /
// scanAgentTopology behavior verbatim. fs effects isolated to a temp dir;
// workspacesDir + addSystemLogInternal injected (the latter spied).

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

let tmpDir: string, workspacesDir: string, wsRoot: string;
let addSystemLogInternal: any;

function setup() {
  const ipc = makeFakeIpcMain();
  addSystemLogInternal = vi.fn();
  registerWorkspaceHandlers({ ipcMain: ipc as any, workspacesDir, addSystemLogInternal });
  return { ipc };
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  workspacesDir = path.join(tmpDir, 'workspaces');
  wsRoot = path.join(tmpDir, 'myproj');
  fs.mkdirSync(wsRoot, { recursive: true }); // an absolute, existing root (passes isWorkspaceRootSafe)
});

afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('registerWorkspaceHandlers — registration', () => {
  it('registers exactly the five workspace channels, all via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual([
      'workspace:check-config', 'workspace:initialize', 'workspace:load-path', 'workspace:save', 'workspace:scanAgentTopology',
    ]);
    for (const ch of ipc.channels()) expect(ipc.styleOf(ch)).toBe('handle');
  });
});

describe('workspace:load-path', () => {
  it('returns the parsed manifest with rootPath injected when present', async () => {
    fs.mkdirSync(path.join(wsRoot, '.agentdeck'), { recursive: true });
    fs.writeFileSync(path.join(wsRoot, '.agentdeck', 'workspace.json'), JSON.stringify({ id: 'x', name: 'X' }), 'utf-8');
    const { ipc } = setup();
    const cfg = await ipc.invoke('workspace:load-path', wsRoot);
    expect(cfg).toMatchObject({ id: 'x', name: 'X', rootPath: wsRoot });
  });

  it('returns null when the manifest is missing', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('workspace:load-path', wsRoot)).toBeNull();
  });

  it('returns null for an unsafe path (relative / traversal)', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('workspace:load-path', 'relative/dir')).toBeNull();
    expect(await ipc.invoke('workspace:load-path', 'C:\\a\\..\\..\\Windows')).toBeNull();
  });
});

describe('workspace:check-config', () => {
  it('reports existence true/false and false for unsafe paths', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('workspace:check-config', wsRoot)).toEqual({ exists: false });
    fs.mkdirSync(path.join(wsRoot, '.agentdeck'), { recursive: true });
    fs.writeFileSync(path.join(wsRoot, '.agentdeck', 'workspace.json'), '{}', 'utf-8');
    expect(await ipc.invoke('workspace:check-config', wsRoot)).toEqual({ exists: true });
    expect(await ipc.invoke('workspace:check-config', 'relative/dir')).toEqual({ exists: false });
  });
});

describe('workspace:initialize — template wizard', () => {
  async function init(templateId: string) {
    const { ipc } = setup();
    const res = await ipc.invoke('workspace:initialize', { folderPath: wsRoot, name: 'My Proj', previewUrl: 'http://localhost:3000', templateId });
    return res;
  }

  it('rejects an unsafe folder path', async () => {
    const { ipc } = setup();
    const res = await ipc.invoke('workspace:initialize', { folderPath: 'relative', name: 'n', previewUrl: 'u', templateId: 'vite' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid workspace folder/);
  });

  it('vite: one frontend service + open-folder & open-preview actions', async () => {
    const res = await init('vite');
    expect(res.success).toBe(true);
    expect(res.workspace.schemaVersion).toBe('agentdeck.workspace.v2');
    expect(res.workspace.services.map((s: any) => s.id)).toEqual(['frontend']);
    expect(res.workspace.services[0].command).toBe('npm run dev');
    expect(res.workspace.quickActions.map((q: any) => q.type)).toEqual(['openFolder', 'previewUrl']);
    // Persisted + logged.
    expect(readJson(path.join(wsRoot, '.agentdeck', 'workspace.json')).name).toBe('My Proj');
    expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('Initialized new workspace'), 'success', expect.any(String));
  });

  it('fastapi: backend uvicorn service + both actions', async () => {
    const res = await init('fastapi');
    expect(res.workspace.services[0].command).toBe('uvicorn main:app --reload');
    expect(res.workspace.quickActions).toHaveLength(2);
  });

  it('static: serve service + only open-folder action', async () => {
    const res = await init('static');
    expect(res.workspace.services[0].command).toBe('npx -y serve');
    expect(res.workspace.quickActions.map((q: any) => q.type)).toEqual(['openFolder']);
  });

  it('custom: no services + only open-folder action', async () => {
    const res = await init('custom');
    expect(res.workspace.services).toEqual([]);
    expect(res.workspace.quickActions.map((q: any) => q.type)).toEqual(['openFolder']);
  });
});

describe('workspace:save — validation + backup + atomic write', () => {
  const validConfig = {
    schemaVersion: 'agentdeck.workspace.v2', id: 'p', name: 'P', previewUrl: 'http://localhost:3000',
    rootPath: '', services: [], quickActions: [],
    terminals: [{ name: 'PowerShell', shell: 'powershell.exe', cwd: '.' }],
  };

  it('rejects an invalid manifest with a validation error', async () => {
    const { ipc } = setup();
    const res = await ipc.invoke('workspace:save', { id: 'p', rootPath: wsRoot, config: { bogus: true } });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Validation failed/);
  });

  it('preset id writes to workspacesDir/<id>.json', async () => {
    fs.mkdirSync(workspacesDir, { recursive: true });
    const { ipc } = setup();
    const res = await ipc.invoke('workspace:save', { id: 'tm4', rootPath: null, config: { ...validConfig, id: 'tm4', name: 'TM4', rootPath: wsRoot } });
    expect(res.success).toBe(true);
    expect(readJson(path.join(workspacesDir, 'tm4.json')).name).toBe('TM4');
    expect(addSystemLogInternal).toHaveBeenCalledWith(expect.stringContaining('Visual configuration saved'), 'success', 'tm4');
  });

  it('dynamic root writes to <rootPath>/.agentdeck/workspace.json and backs up an existing manifest', async () => {
    const cfgPath = path.join(wsRoot, '.agentdeck', 'workspace.json');
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify({ old: true }), 'utf-8'); // pre-existing -> should be backed up
    const { ipc } = setup();
    const res = await ipc.invoke('workspace:save', { id: 'custom-proj', rootPath: wsRoot, config: { ...validConfig, id: 'custom-proj', name: 'CP', rootPath: wsRoot } });
    expect(res.success).toBe(true);
    expect(readJson(cfgPath).name).toBe('CP');
    // A timestamped backup was created next to it.
    const backups = fs.readdirSync(path.dirname(cfgPath)).filter((f) => f.startsWith('workspace.json.bak-'));
    expect(backups.length).toBe(1);
    // No leftover temp files from the atomic write.
    expect(fs.readdirSync(path.dirname(cfgPath)).some((f) => f.includes('.tmp-'))).toBe(false);
  });

  it('returns an error when neither preset nor rootPath is provided', async () => {
    const { ipc } = setup();
    const res = await ipc.invoke('workspace:save', { id: 'not-a-preset', rootPath: null, config: validConfig });
    expect(res).toEqual({ success: false, error: 'Target workspace root path is missing.' });
  });

  it('rejects a dynamic save with an unsafe rootPath', async () => {
    const { ipc } = setup();
    const res = await ipc.invoke('workspace:save', { id: 'x', rootPath: 'relative/dir', config: validConfig });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid workspace folder/);
  });
});

describe('workspace:scanAgentTopology', () => {
  it('delegates to scanAgentTopologyInternal and returns its result', async () => {
    // Real pure scanner over an empty dir -> returns a suggestion object.
    const { ipc } = setup();
    const result = await ipc.invoke('workspace:scanAgentTopology', wsRoot);
    expect(result).toBeTypeOf('object');
    expect(result).not.toBeNull();
  });
});
