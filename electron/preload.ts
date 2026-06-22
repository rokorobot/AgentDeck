import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  workspaces: {
    loadAll: () => ipcRenderer.invoke('workspaces:load-all'),
    load: (id: string) => ipcRenderer.invoke('workspaces:load', id),
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
    loadFromPath: (path: string) => ipcRenderer.invoke('workspace:load-path', path),
    checkConfig: (path: string) => ipcRenderer.invoke('workspace:check-config', path),
    initialize: (folderPath: string, name: string, previewUrl: string, templateId: string) =>
      ipcRenderer.invoke('workspace:initialize', { folderPath, name, previewUrl, templateId }),
    save: (id: string, rootPath: string, config: any) =>
      ipcRenderer.invoke('workspace:save', { id, rootPath, config }),
    scanAgentTopology: (rootPath: string) =>
      ipcRenderer.invoke('workspace:scanAgentTopology', rootPath),
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
  },
  evals: {
    loadData: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('evals:load-data', { rootPath, presetId }),
    saveBenchmarks: (rootPath: string | null, presetId: string, benchmarks: any[]) =>
      ipcRenderer.invoke('evals:save-benchmarks', { rootPath, presetId, benchmarks }),
    saveFailure: (rootPath: string | null, presetId: string, failure: any) =>
      ipcRenderer.invoke('evals:save-failure', { rootPath, presetId, failure }),
    deleteFailure: (rootPath: string | null, presetId: string, failureId: string) =>
      ipcRenderer.invoke('evals:delete-failure', { rootPath, presetId, failureId }),
    saveRegressionHistory: (rootPath: string | null, presetId: string, history: any[]) =>
      ipcRenderer.invoke('evals:save-regression-history', { rootPath, presetId, history }),
    saveGoldStandard: (rootPath: string | null, presetId: string, item: any) =>
      ipcRenderer.invoke('evals:save-gold-standard', { rootPath, presetId, item }),
    deleteGoldStandard: (rootPath: string | null, presetId: string, id: string) =>
      ipcRenderer.invoke('evals:delete-gold-standard', { rootPath, presetId, id }),
    saveJudges: (rootPath: string | null, presetId: string, list: any[]) =>
      ipcRenderer.invoke('evals:save-judges', { rootPath, presetId, list }),
    savePromotions: (rootPath: string | null, presetId: string, list: any[]) =>
      ipcRenderer.invoke('evals:save-promotions', { rootPath, presetId, list }),
  },
  timeline: {
    loadEvents: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('timeline:load-events', { rootPath, presetId }),
    saveEvent: (rootPath: string | null, presetId: string, event: any) =>
      ipcRenderer.invoke('timeline:save-event', { rootPath, presetId, event }),
  },
  governance: {
    loadData: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('governance:load-data', { rootPath, presetId }),
    savePolicies: (rootPath: string | null, presetId: string, policies: any) =>
      ipcRenderer.invoke('governance:save-policies', { rootPath, presetId, policies }),
    saveCandidates: (rootPath: string | null, presetId: string, list: any[]) =>
      ipcRenderer.invoke('governance:save-candidates', { rootPath, presetId, list }),
  },
  snapshots: {
    loadAll: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('snapshots:load-all', { rootPath, presetId }),
    create: (rootPath: string | null, presetId: string, description: string, type: string, payload: any, parentSnapshotId?: string) =>
      ipcRenderer.invoke('snapshots:create', { rootPath, presetId, description, type, payload, parentSnapshotId }),
    restore: (rootPath: string | null, presetId: string, snapshotId: string) =>
      ipcRenderer.invoke('snapshots:restore', { rootPath, presetId, snapshotId }),
    loadPayload: (rootPath: string | null, presetId: string, snapshotId: string) =>
      ipcRenderer.invoke('snapshots:load-payload', { rootPath, presetId, snapshotId })
  },
  provenance: {
    loadAll: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('provenance:load-all', { rootPath, presetId }),
    recordMutation: (rootPath: string | null, presetId: string, record: any) =>
      ipcRenderer.invoke('provenance:record-mutation', { rootPath, presetId, record }),
    seal: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('provenance:seal', { rootPath, presetId })
  },
  doctor: {
    runChecks: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('doctor:run-checks', { rootPath, presetId }),
    repair: (rootPath: string | null, presetId: string, checkId: string) =>
      ipcRenderer.invoke('doctor:repair', { rootPath, presetId, checkId }),
    exportDiagnosticBundle: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('doctor:export-diagnostic-bundle', { rootPath, presetId })
  },
  dep: {
    generate: (rootPath: string | null, presetId: string, candidateId: string) =>
      ipcRenderer.invoke('dep:generate', { rootPath, presetId, candidateId }),
    signAndSave: (rootPath: string | null, presetId: string, dep: any, decisionRationale: string, decisionClass: string, overrideReason?: string) =>
      ipcRenderer.invoke('dep:sign-and-save', { rootPath, presetId, dep, decisionRationale, decisionClass, overrideReason }),
    loadAll: (rootPath: string | null, presetId: string) =>
      ipcRenderer.invoke('dep:load-all', { rootPath, presetId }),
    verify: (rootPath: string | null, presetId: string, depId: string) =>
      ipcRenderer.invoke('dep:verify', { rootPath, presetId, depId }),
    exportJson: (rootPath: string | null, presetId: string, depId: string) =>
      ipcRenderer.invoke('dep:export-json', { rootPath, presetId, depId }),
    exportMarkdown: (rootPath: string | null, presetId: string, depId: string) =>
      ipcRenderer.invoke('dep:export-markdown', { rootPath, presetId, depId })
  }
});

