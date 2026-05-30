import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  workspaces: {
    loadAll: () => ipcRenderer.invoke('workspaces:load-all'),
    load: (id: string) => ipcRenderer.invoke('workspaces:load', id),
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
    loadFromPath: (path: string) => ipcRenderer.invoke('workspace:load-path', path),
  },
  layout: {
    save: (layout: any) => ipcRenderer.invoke('layout:save', layout),
    load: () => ipcRenderer.invoke('layout:load'),
  },
  logs: {
    save: (logs: any[]) => ipcRenderer.invoke('logs:save', logs),
    load: () => ipcRenderer.invoke('logs:load'),
    add: (logEntry: any) => ipcRenderer.invoke('logs:add', logEntry),
    onLogsChanged: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('logs:changed', handler);
      return () => ipcRenderer.off('logs:changed', handler);
    }
  },
  ollama: {
    checkStatus: () => ipcRenderer.invoke('ollama:check-status'),
  },
  ports: {
    checkHealth: (url: string) => ipcRenderer.invoke('port:check-health', url),
  },
  process: {
    start: (workspaceId: string, command: any, cwd: string) =>
      ipcRenderer.invoke('process:start', { workspaceId, command, cwd }),
    stop: (runId: string) => ipcRenderer.invoke('process:stop', runId),
    restart: (runId: string) => ipcRenderer.invoke('process:restart', runId),
    list: () => ipcRenderer.invoke('process:list'),
    onStateChanged: (callback: (processes: any[]) => void) => {
      const handler = (_event: any, processes: any[]) => callback(processes);
      ipcRenderer.on('process:state-changed', handler);
      return () => ipcRenderer.off('process:state-changed', handler);
    }
  },
  ide: {
    open: (ide: string, folderPath: string) => ipcRenderer.invoke('ide:open', { ide, folderPath }),
  },
  terminal: {
    create: (id: string, shell: string, args: string[], cwd: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:create', { id, shell, args, cwd, cols, rows }),
    write: (id: string, data: string) => ipcRenderer.send('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_event: any, data: string) => callback(data);
      ipcRenderer.on(`terminal-data-${id}`, handler);
      return () => ipcRenderer.off(`terminal-data-${id}`, handler);
    },
    onExit: (id: string, callback: (code: number) => void) => {
      const handler = (_event: any, code: number) => callback(code);
      ipcRenderer.on(`terminal-exit-${id}`, handler);
      return () => ipcRenderer.off(`terminal-exit-${id}`, handler);
    },
    onFallbackRecreated: (id: string, callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(`terminal-fallback-recreated-${id}`, handler);
      return () => ipcRenderer.off(`terminal-fallback-recreated-${id}`, handler);
    },
  },
  safety: {
    approveCommand: (command: string) => ipcRenderer.invoke('safety:approve', command),
  }
});
