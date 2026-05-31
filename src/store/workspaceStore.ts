import { create } from 'zustand';
import { Workspace, ManagedProcess } from '../types/workspace';
import { checkCommandSafety } from '../lib/commandSafety';
import { BenchmarkDefinition, RegressionRun, ApprovalQueueItem, FailureCase } from '../types/evals';

// Extend window object types for TypeScript safety
declare global {
  interface Window {
    api: {
      workspaces: {
        loadAll(): Promise<Workspace[]>;
        load(id: string): Promise<Workspace | null>;
        openDirectory(): Promise<string | null>;
        loadFromPath(path: string): Promise<Workspace | null>;
        checkConfig(path: string): Promise<{ exists: boolean }>;
        initialize(folderPath: string, name: string, previewUrl: string, templateId: string): Promise<{ success: boolean; error?: string; workspace?: Workspace }>;
        save(id: string, rootPath: string, config: any): Promise<{ success: boolean; error?: string; workspace?: Workspace }>;
      };
      layout: {
        save(layout: any): Promise<boolean>;
        load(): Promise<any>;
      };
      logs: {
        save(logs: any[]): Promise<boolean>;
        load(): Promise<any[]>;
        add(logEntry: any): Promise<any>;
        onLogsChanged(callback: () => void): () => void;
      };
      ollama: {
        checkStatus(): Promise<{ running: boolean; models: string[] }>;
      };
      ports: {
        checkHealth(url: string): Promise<{ online: boolean }>;
      };
      process: {
        start(workspaceId: string, command: any, cwd: string): Promise<ManagedProcess>;
        stop(runId: string): Promise<boolean>;
        restart(runId: string): Promise<ManagedProcess | null>;
        list(): Promise<ManagedProcess[]>;
        onStateChanged(callback: (processes: ManagedProcess[]) => void): () => void;
      };
      ide: {
        open(ide: string, folderPath: string): Promise<{ success: boolean; error?: string }>;
      };
      terminal: {
        create(
          id: string,
          shell: string,
          args: string[],
          cwd: string,
          cols: number,
          rows: number
        ): Promise<{ id: string; type: string }>;
        write(id: string, data: string): void;
        resize(id: string, cols: number, rows: number): void;
        kill(id: string): Promise<boolean>;
        onData(id: string, callback: (data: string) => void): () => void;
        onExit(id: string, callback: (code: number) => void): () => void;
        onFallbackRecreated(id: string, callback: () => void): () => void;
      };
      safety: {
        approveCommand(command: string): Promise<boolean>;
      };
      evals: {
        loadData(rootPath: string | null, presetId: string): Promise<{ benchmarks: any[]; runs: any[]; failures: any[] }>;
        saveBenchmarks(rootPath: string | null, presetId: string, benchmarks: any[]): Promise<boolean>;
        saveFailure(rootPath: string | null, presetId: string, failure: any): Promise<boolean>;
        deleteFailure(rootPath: string | null, presetId: string, failureId: string): Promise<boolean>;
        saveRegressionHistory(rootPath: string | null, presetId: string, history: any[]): Promise<boolean>;
      };
    };
  }
}

export interface TerminalSessionState {
  id: string;
  name: string;
  shell: string;
  type: string;
}

interface SafetyDialogState {
  open: boolean;
  command: string;
  terminalId: string;
  reason: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface WorkspaceObservability {
  apiOnline: boolean;
  port: number;
  runsCount: number;
  modelCount?: number;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  workspacePaths: string[];
  activeWorkspace: Workspace | null;
  activeTerminalTabId: string | null;
  sidebarWidth: number;
  ollamaStatus: { running: boolean; models: string[] };
  systemLogs: any[];
  terminalSessions: TerminalSessionState[];
  safetyDialog: SafetyDialogState | null;
  workspaceObservability: Record<string, WorkspaceObservability>;
  managedProcesses: ManagedProcess[];
  runtimeLogs: { timestamp: string; tabName: string; message: string }[];
  terminalWidthPercent: number;
  logsHeightPercent: number;
  previewUrlOverride: string | null;

  init(): Promise<void>;
  setActiveWorkspace(id: string): Promise<void>;
  setSidebarWidth(width: number): Promise<void>;
  setActiveTerminalTabId(id: string | null): void;
  createTerminal(name: string, shell: string, cwd: string, initialCommand?: string): Promise<string>;
  killTerminal(id: string): Promise<void>;
  checkOllama(): Promise<void>;
  addSystemLog(message: string, type: 'info' | 'warning' | 'error' | 'success'): Promise<void>;
  loadLogsFromBackend(): Promise<void>;
  setSafetyDialog(dialog: SafetyDialogState | null): void;
  approveSafetyCommand(command: string): Promise<boolean>;
  addWorkspaceFolder(): Promise<void>;
  pollPortsHealth(): Promise<void>;
  executeWorkspaceCommand(commandId: string): Promise<void>;
  startManagedProcess(cmd: any): Promise<void>;
  stopManagedProcess(runId: string): Promise<void>;
  restartManagedProcess(runId: string): Promise<void>;
  openWorkspaceInIDE(ide: string): Promise<void>;
  addRuntimeLog(terminalId: string, data: string): void;
  updatePanelDimensions(terminalWidth: number, logsHeight: number): Promise<void>;
  setPreviewUrlOverride(url: string | null): void;
  startAllServices(): Promise<void>;
  stopAllServices(): Promise<void>;
  restartAllServices(): Promise<void>;
  executeQuickAction(action: any): Promise<void>;
  showWizard: boolean;
  wizardPath: string | null;
  setWizardState(show: boolean, path?: string | null): void;
  initializeWorkspace(folderPath: string, name: string, previewUrl: string, templateId: string): Promise<void>;
  saveActiveWorkspace(config: any): Promise<{ success: boolean; error?: string }>;

  // Evaluations Center State
  benchmarks: BenchmarkDefinition[];
  regressionRuns: RegressionRun[];
  approvalQueue: ApprovalQueueItem[];
  failures: FailureCase[];
  isRunningBenchmark: boolean;
  loadEvalsData(): Promise<void>;
  runRegressionSet(benchmarkId: string): Promise<void>;
  approveRun(approvalId: string): Promise<void>;
  rejectRun(approvalId: string): Promise<void>;
  promoteToBaseline(benchmarkId: string, runId: string): Promise<void>;
  saveFailureCase(failure: FailureCase): Promise<void>;
  deleteFailureCase(failureId: string): Promise<void>;
  createBenchmark(benchmark: BenchmarkDefinition): Promise<void>;
}

const terminalLineBuffers: Record<string, string> = {};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  let ollamaInterval: NodeJS.Timeout | null = null;
  let healthInterval: NodeJS.Timeout | null = null;
  let offStateListener: (() => void) | null = null;
  let offLogsListener: (() => void) | null = null;

  return {
    workspaces: [],
    workspacePaths: [],
    activeWorkspace: null,
    activeTerminalTabId: null,
    sidebarWidth: 210,
    ollamaStatus: { running: false, models: [] },
    systemLogs: [],
    terminalSessions: [],
    safetyDialog: null,
    workspaceObservability: {},
    managedProcesses: [],
    runtimeLogs: [],
    terminalWidthPercent: 50,
    logsHeightPercent: 22,
    previewUrlOverride: null,
    showWizard: false,
    wizardPath: null,
    benchmarks: [],
    regressionRuns: [],
    approvalQueue: [],
    failures: [],
    isRunningBenchmark: false,

    init: async () => {
      // 1. Load layout configs and logs
      const savedLayout = await window.api.layout.load();
      const savedLogs = await window.api.logs.load();
      const initialProcesses = await window.api.process.list();
      
      const loadedPaths: string[] = savedLayout.workspacePaths || [];
      const loadedWorkspaces: Workspace[] = [];

      // 2. Load presets
      const defaultPresets = await window.api.workspaces.loadAll();
      loadedWorkspaces.push(...defaultPresets);

      // 3. Scan user folders
      for (const folderPath of loadedPaths) {
        try {
          const ws = await window.api.workspaces.loadFromPath(folderPath);
          if (ws) {
            if (!loadedWorkspaces.some((w) => w.id === ws.id)) {
              loadedWorkspaces.push(ws);
            }
          }
        } catch (e) {
          console.error(`Failed to scan registered folder ${folderPath}:`, e);
        }
      }

      set({
        workspaces: loadedWorkspaces,
        workspacePaths: loadedPaths,
        sidebarWidth: savedLayout.sidebarWidth || 210,
        systemLogs: savedLogs,
        managedProcesses: initialProcesses,
        terminalWidthPercent: savedLayout.terminalWidthPercent !== undefined ? savedLayout.terminalWidthPercent : 50,
        logsHeightPercent: savedLayout.logsHeightPercent !== undefined ? savedLayout.logsHeightPercent : 22,
      });

      // 4. Set active workspace scope
      const targetWorkspaceId = savedLayout.activeWorkspaceId || 'tm4';
      await get().setActiveWorkspace(targetWorkspaceId);

      // 5. Ollama health check interval
      await get().checkOllama();
      if (ollamaInterval) clearInterval(ollamaInterval);
      ollamaInterval = setInterval(() => {
        get().checkOllama();
      }, 10000);

      // 6. Local port checking interval
      await get().pollPortsHealth();
      if (healthInterval) clearInterval(healthInterval);
      healthInterval = setInterval(() => {
        get().pollPortsHealth();
      }, 6000);

      // 7. IPC Process & logs updates observers
      if (offStateListener) offStateListener();
      offStateListener = window.api.process.onStateChanged((processes) => {
        set({ managedProcesses: processes });
      });

      if (offLogsListener) offLogsListener();
      offLogsListener = window.api.logs.onLogsChanged(() => {
        get().loadLogsFromBackend();
      });
    },

    setActiveWorkspace: async (id: string) => {
      const { workspaces, terminalSessions } = get();
      const workspace = workspaces.find((w) => w.id === id);
      if (!workspace) return;

      // Kill previous terminals (non-managed shell console sessions only)
      // Managed processes are preserved and we don't kill them blindly!
      for (const session of terminalSessions) {
        // If it starts with 'run-', it's a managed process. Preserve it!
        if (!session.id.startsWith('run-')) {
          await window.api.terminal.kill(session.id);
        }
      }

      set({
        activeWorkspace: workspace,
        terminalSessions: get().terminalSessions.filter((s) => s.id.startsWith('run-')),
        activeTerminalTabId: null,
        previewUrlOverride: null,
      });

      // Spawning default TTY terminals
      const spawnedSessions: TerminalSessionState[] = [];
      let firstTabId: string | null = null;

      for (const preset of workspace.terminals) {
        const termId = `term-${workspace.id}-${preset.name.toLowerCase().replace(/\s+/g, '-')}`;
        const cwd = workspace.rootPath || 'E:\\AgentDeck';

        try {
          const res = await window.api.terminal.create(termId, preset.shell, [], cwd, 80, 24);
          
          spawnedSessions.push({
            id: termId,
            name: preset.name,
            shell: preset.shell,
            type: res.type,
          });

          await get().addSystemLog(`Spawned preset terminal session: ${preset.name} (${preset.shell})`, 'info');

          if (!firstTabId) {
            firstTabId = termId;
          }

          // If preset defines shell command, write it
          if (preset.command) {
            setTimeout(() => {
              window.api.terminal.write(termId, preset.command + '\r');
            }, 600);
          }
        } catch (e) {
          console.error(`Failed to spawn terminal preset ${preset.name}:`, e);
        }
      }

      // Merge user shells with running commands tabs
      set((state) => {
        const merged = [...spawnedSessions, ...state.terminalSessions];
        const activeTab = firstTabId || (merged.length > 0 ? merged[0].id : null);
        return {
          terminalSessions: merged,
          activeTerminalTabId: activeTab,
        };
      });

      // Save layout json
      await window.api.layout.save({
        activeWorkspaceId: id,
        sidebarWidth: get().sidebarWidth,
        activeTerminalTabId: get().activeTerminalTabId,
        workspacePaths: get().workspacePaths,
        terminalWidthPercent: get().terminalWidthPercent,
        logsHeightPercent: get().logsHeightPercent,
      });

      await get().addSystemLog(`Scope workspace switched to ${workspace.name}`, 'info');
      await get().loadEvalsData();
    },

    setSidebarWidth: async (width: number) => {
      set({ sidebarWidth: width });
      const activeWorkspace = get().activeWorkspace;
      
      await window.api.layout.save({
        activeWorkspaceId: activeWorkspace ? activeWorkspace.id : 'tm4',
        sidebarWidth: width,
        activeTerminalTabId: get().activeTerminalTabId,
        workspacePaths: get().workspacePaths,
        terminalWidthPercent: get().terminalWidthPercent,
        logsHeightPercent: get().logsHeightPercent,
      });
    },

    setActiveTerminalTabId: (id: string | null) => {
      set({ activeTerminalTabId: id });
    },

    createTerminal: async (name: string, shell: string, cwd: string, initialCommand?: string) => {
      const activeWorkspace = get().activeWorkspace;
      const workspaceId = activeWorkspace ? activeWorkspace.id : 'custom';
      const termId = `term-${workspaceId}-user-${Date.now()}`;

      try {
        const res = await window.api.terminal.create(termId, shell, [], cwd, 80, 24);
        
        const newSession: TerminalSessionState = {
          id: termId,
          name: name,
          shell: shell,
          type: res.type,
        };

        set((state) => ({
          terminalSessions: [...state.terminalSessions, newSession],
          activeTerminalTabId: termId,
        }));

        if (initialCommand) {
          setTimeout(() => {
            window.api.terminal.write(termId, initialCommand + '\r');
          }, 600);
        }

        await get().addSystemLog(`Launched custom terminal tab ${name}`, 'success');
        return termId;
      } catch (e) {
        console.error(e);
        await get().addSystemLog(`Failed to create custom terminal`, 'error');
        throw e;
      }
    },

    killTerminal: async (id: string) => {
      try {
        // If killing a managed process tab, trigger process stop sequence too!
        const isManaged = id.startsWith('run-');
        if (isManaged) {
          await get().stopManagedProcess(id);
          return;
        }

        await window.api.terminal.kill(id);
        
        set((state) => {
          const filtered = state.terminalSessions.filter((s) => s.id !== id);
          let newActive = state.activeTerminalTabId;
          
          if (state.activeTerminalTabId === id) {
            newActive = filtered.length > 0 ? filtered[0].id : null;
          }

          return {
            terminalSessions: filtered,
            activeTerminalTabId: newActive,
          };
        });
      } catch (e) {
        console.error(e);
      }
    },

    checkOllama: async () => {
      const prevOllamaStatus = get().ollamaStatus;
      try {
        const status = await window.api.ollama.checkStatus();
        set({ ollamaStatus: status });
        
        if (prevOllamaStatus.running !== status.running) {
          await get().addSystemLog(`Ollama local GPU service is now ${status.running ? 'ONLINE' : 'OFFLINE'}`, status.running ? 'success' : 'error');
        }
      } catch (e) {
        set({ ollamaStatus: { running: false, models: [] } });
        if (prevOllamaStatus.running) {
          await get().addSystemLog(`Ollama local GPU service is now OFFLINE`, 'error');
        }
      }
    },

    addSystemLog: async (message: string, type: 'info' | 'warning' | 'error' | 'success') => {
      const activeWorkspace = get().activeWorkspace;
      const logEntry = {
        message,
        type,
        workspaceId: activeWorkspace ? activeWorkspace.id : undefined,
      };

      const logged = await window.api.logs.add(logEntry);
      if (logged) {
        set((state) => ({
          systemLogs: [logged, ...state.systemLogs].slice(0, 200),
        }));
      }
    },

    loadLogsFromBackend: async () => {
      const savedLogs = await window.api.logs.load();
      set({ systemLogs: savedLogs });
    },

    setSafetyDialog: (dialog: SafetyDialogState | null) => {
      set({ safetyDialog: dialog });
    },

    approveSafetyCommand: async (command: string) => {
      return await window.api.safety.approveCommand(command);
    },

    addWorkspaceFolder: async () => {
      try {
        const folderPath = await window.api.workspaces.openDirectory();
        if (!folderPath) return;

        const { workspacePaths, workspaces } = get();

        if (workspacePaths.includes(folderPath)) {
          const loaded = workspaces.find((w) => w.rootPath.toLowerCase() === folderPath.toLowerCase());
          if (loaded) {
            await get().setActiveWorkspace(loaded.id);
          }
          return;
        }

        const check = await window.api.workspaces.checkConfig(folderPath);
        if (!check.exists) {
          set({
            showWizard: true,
            wizardPath: folderPath,
          });
          return;
        }

        const ws = await window.api.workspaces.loadFromPath(folderPath);
        if (!ws) {
          await get().addSystemLog('Selected directory scanner failed.', 'error');
          return;
        }

        const updatedPaths = [...workspacePaths, folderPath];
        const updatedWorkspaces = [...workspaces];
        if (!updatedWorkspaces.some((w) => w.id === ws.id)) {
          updatedWorkspaces.push(ws);
        }

        set({
          workspacePaths: updatedPaths,
          workspaces: updatedWorkspaces,
        });

        await get().setActiveWorkspace(ws.id);
        await get().addSystemLog(`Successfully registered dynamic workspace: ${ws.name}`, 'success');
      } catch (err) {
        console.error('Failed to add directory:', err);
        await get().addSystemLog('Error adding project folder.', 'error');
      }
    },

    pollPortsHealth: async () => {
      const { workspaces } = get();
      const nextObservability: Record<string, WorkspaceObservability> = {};

      for (const ws of workspaces) {
        let isOnline = false;
        let portNum = 80;

        try {
          const urlObj = new URL(ws.previewUrl);
          portNum = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
          
          const check = await window.api.ports.checkHealth(ws.previewUrl);
          isOnline = check.online;
        } catch {
          isOnline = false;
        }

        let runsMock = 0;
        if (isOnline) {
          if (ws.id === 'tm4') runsMock = 14;
          else if (ws.id === 'sound-machina') runsMock = 1;
          else runsMock = 3;
        }

        nextObservability[ws.id] = {
          apiOnline: isOnline,
          port: portNum,
          runsCount: runsMock,
          modelCount: ws.id === 'sound-machina' ? 2 : undefined,
        };

        const prevObs = get().workspaceObservability[ws.id];
        if (!prevObs || prevObs.apiOnline !== isOnline) {
          await get().addSystemLog(`Workspace Health: API service for "${ws.name}" is now ${isOnline ? 'HEALTHY (Port ' + portNum + ')' : 'OFFLINE'}`, isOnline ? 'success' : 'warning');
        }
      }

      set({ workspaceObservability: nextObservability });
    },

    executeWorkspaceCommand: async (commandId: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace || !activeWorkspace.commands) return;

      const cmd = activeWorkspace.commands.find((c) => c.id === commandId);
      if (!cmd) return;

      const cwd = activeWorkspace.rootPath || 'E:\\AgentDeck';

      // Check if command is already running!
      const isRunning = get().managedProcesses.some(p => p.commandId === commandId && p.workspaceId === activeWorkspace.id && p.status === 'running');
      if (isRunning) {
        const runningProc = get().managedProcesses.find(p => p.commandId === commandId && p.workspaceId === activeWorkspace.id && p.status === 'running');
        if (runningProc) {
          // Bring focus to the tab
          set({ activeTerminalTabId: runningProc.id });
        }
        return;
      }

      // Check command safety
      const safetyCheck = checkCommandSafety(cmd.command, cwd);
      if (!safetyCheck.safe) {
        set({
          safetyDialog: {
            open: true,
            command: cmd.command,
            terminalId: 'startup-action',
            reason: safetyCheck.reason || '',
            onConfirm: async () => {
              await window.api.safety.approveCommand(cmd.command);
              await get().startManagedProcess(cmd);
            },
            onCancel: () => {
              get().addSystemLog(`Managed action "${cmd.label}" blocked by security dialog.`, 'warning');
            }
          }
        });
        return;
      }

      await get().startManagedProcess(cmd);
    },

    startManagedProcess: async (cmd: any) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;
      const cwd = activeWorkspace.rootPath || 'E:\\AgentDeck';

      try {
        const proc = await window.api.process.start(activeWorkspace.id, cmd, cwd);
        
        // Add tab session named like command label
        const newSession: TerminalSessionState = {
          id: proc.id,
          name: cmd.label,
          shell: cmd.shell,
          type: 'node-pty',
        };

        set((state) => ({
          terminalSessions: [...state.terminalSessions, newSession],
          activeTerminalTabId: proc.id,
          managedProcesses: [...state.managedProcesses, proc],
        }));

        await get().addSystemLog(`PROCESS_START_REQUESTED: Spawned managed process "${cmd.label}" (PID ${proc.pid})`, 'success');
      } catch (e) {
        console.error('Failed to spawn process:', e);
      }
    },

    stopManagedProcess: async (runId: string) => {
      try {
        const success = await window.api.process.stop(runId);
        if (success) {
          // Remove from terminal tabs
          set((state) => {
            const filtered = state.terminalSessions.filter((s) => s.id !== runId);
            let newActive = state.activeTerminalTabId;
            if (state.activeTerminalTabId === runId) {
              newActive = filtered.length > 0 ? filtered[0].id : null;
            }
            return {
              terminalSessions: filtered,
              activeTerminalTabId: newActive
            };
          });
        }
      } catch (e) {
        console.error('Error stopping managed process:', e);
      }
    },

    restartManagedProcess: async (runId: string) => {
      const proc = get().managedProcesses.find((p) => p.id === runId);
      if (!proc) return;

      try {
        // Kill existing tab panel on frontend
        set((state) => ({
          terminalSessions: state.terminalSessions.filter((s) => s.id !== runId),
          activeTerminalTabId: state.activeTerminalTabId === runId ? null : state.activeTerminalTabId
        }));

        const newProc = await window.api.process.restart(runId);
        if (newProc) {
          const newSession: TerminalSessionState = {
            id: newProc.id,
            name: newProc.label,
            shell: newProc.shell,
            type: 'node-pty',
          };

          set((state) => ({
            terminalSessions: [...state.terminalSessions, newSession],
            activeTerminalTabId: newProc.id,
          }));

          await get().addSystemLog(`PROCESS_RESTARTED: Re-spawned process "${newProc.label}" (PID ${newProc.pid})`, 'success');
        }
      } catch (e) {
        console.error('Failed to restart process:', e);
      }
    },

    openWorkspaceInIDE: async (ide: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      try {
        const res = await window.api.ide.open(ide, activeWorkspace.rootPath);
        if (!res.success) {
          await get().addSystemLog(`IDE Open Error: ${res.error}`, 'error');
        }
      } catch (e) {
        console.error('Failed to open IDE:', e);
      }
    },

    addRuntimeLog: (terminalId: string, data: string) => {
      const { terminalSessions } = get();
      const session = terminalSessions.find(s => s.id === terminalId);
      const tabName = session ? session.name : 'Terminal';

      let currentBuffer = terminalLineBuffers[terminalId] || '';
      currentBuffer += data;

      const lines = currentBuffer.split(/\r?\n/);
      terminalLineBuffers[terminalId] = lines.pop() || '';

      if (lines.length === 0) return;

      const cleanLines = lines.map(line => {
        let cleaned = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        cleaned = cleaned.replace(/\r/g, '');
        return cleaned.trim();
      }).filter(line => line.length > 0);

      if (cleanLines.length === 0) return;

      const newEntries = cleanLines.map(line => ({
        timestamp: new Date().toISOString(),
        tabName,
        message: line
      }));

      set(state => ({
        runtimeLogs: [...state.runtimeLogs, ...newEntries].slice(-500)
      }));
    },

    updatePanelDimensions: async (terminalWidth: number, logsHeight: number) => {
      set({
        terminalWidthPercent: terminalWidth,
        logsHeightPercent: logsHeight,
      });

      const activeWorkspace = get().activeWorkspace;
      await window.api.layout.save({
        activeWorkspaceId: activeWorkspace ? activeWorkspace.id : 'tm4',
        sidebarWidth: get().sidebarWidth,
        activeTerminalTabId: get().activeTerminalTabId,
        workspacePaths: get().workspacePaths,
        terminalWidthPercent: terminalWidth,
        logsHeightPercent: logsHeight,
      });
    },

    setPreviewUrlOverride: (url: string | null) => {
      set({ previewUrlOverride: url });
    },

    startAllServices: async () => {
      const { activeWorkspace, managedProcesses } = get();
      if (!activeWorkspace || !activeWorkspace.services) return;

      await get().addSystemLog(`START_ALL_SERVICES_REQUESTED: Spawning all managed service groups for "${activeWorkspace.name}"`, 'info');

      for (const service of activeWorkspace.services) {
        const isRunning = managedProcesses.some(
          (p) => p.commandId === service.id && p.workspaceId === activeWorkspace.id && (p.status === 'running' || p.status === 'starting')
        );
        if (isRunning) {
          continue;
        }
        await get().startManagedProcess(service);
      }
    },

    stopAllServices: async () => {
      const { activeWorkspace, managedProcesses } = get();
      if (!activeWorkspace || !activeWorkspace.services) return;

      await get().addSystemLog(`STOP_ALL_SERVICES_REQUESTED: Terminating service groups for "${activeWorkspace.name}"`, 'warning');

      for (const service of activeWorkspace.services) {
        const proc = managedProcesses.find(
          (p) => p.commandId === service.id && p.workspaceId === activeWorkspace.id && (p.status === 'running' || p.status === 'starting')
        );
        if (proc) {
          await get().stopManagedProcess(proc.id);
        }
      }
    },

    restartAllServices: async () => {
      const { activeWorkspace, managedProcesses } = get();
      if (!activeWorkspace || !activeWorkspace.services) return;

      await get().addSystemLog(`RESTART_ALL_SERVICES_REQUESTED: Restarting active service groups for "${activeWorkspace.name}"`, 'warning');

      for (const service of activeWorkspace.services) {
        const proc = managedProcesses.find(
          (p) => p.commandId === service.id && p.workspaceId === activeWorkspace.id && (p.status === 'running' || p.status === 'starting')
        );
        if (proc) {
          await get().restartManagedProcess(proc.id);
        }
      }
    },

    executeQuickAction: async (action: any) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      await get().addSystemLog(`QUICK_ACTION_TRIGGERED: Executing "${action.label}"`, 'info');

      if (action.type === 'openFolder') {
        await get().openWorkspaceInIDE('folder');
      } else if (action.type === 'previewUrl') {
        if (action.url) {
          get().setPreviewUrlOverride(action.url);
        }
      } else if (action.type === 'command') {
        if (action.command) {
          const shell = 'powershell.exe';
          const name = action.label;
          const cwd = activeWorkspace.rootPath || 'E:\\AgentDeck';
          await get().createTerminal(name, shell, cwd, action.command);
        }
      } else if (action.type === 'startService') {
        if (action.serviceId && activeWorkspace.services) {
          const service = activeWorkspace.services.find(s => s.id === action.serviceId);
          if (service) {
            const isRunning = get().managedProcesses.some(
              p => p.commandId === service.id && p.workspaceId === activeWorkspace.id && (p.status === 'running' || p.status === 'starting')
            );
            if (isRunning) {
              const runningProc = get().managedProcesses.find(
                p => p.commandId === service.id && p.workspaceId === activeWorkspace.id && (p.status === 'running' || p.status === 'starting')
              );
              if (runningProc) {
                set({ activeTerminalTabId: runningProc.id });
              }
            } else {
              await get().startManagedProcess(service);
            }
          }
        }
      }
    },

    setWizardState: (show: boolean, path: string | null = null) => {
      set({ showWizard: show, wizardPath: path });
    },

    initializeWorkspace: async (folderPath: string, name: string, previewUrl: string, templateId: string) => {
      try {
        const res = await window.api.workspaces.initialize(folderPath, name, previewUrl, templateId);
        if (!res.success || !res.workspace) {
          await get().addSystemLog(`Failed to initialize workspace: ${res.error}`, 'error');
          return;
        }

        const ws = res.workspace;
        const { workspacePaths, workspaces } = get();

        const updatedPaths = [...workspacePaths, folderPath];
        const updatedWorkspaces = [...workspaces];
        if (!updatedWorkspaces.some((w) => w.id === ws.id)) {
          updatedWorkspaces.push(ws);
        }

        set({
          workspacePaths: updatedPaths,
          workspaces: updatedWorkspaces,
          showWizard: false,
          wizardPath: null,
        });

        await get().setActiveWorkspace(ws.id);
        await get().addSystemLog(`Successfully initialized workspace: ${ws.name}`, 'success');
      } catch (err) {
        console.error('Failed to initialize workspace:', err);
        await get().addSystemLog('Error initializing workspace.', 'error');
      }
    },

    saveActiveWorkspace: async (config: any) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return { success: false, error: 'No active workspace.' };

      try {
        const res = await window.api.workspaces.save(activeWorkspace.id, activeWorkspace.rootPath, config);
        if (!res.success || !res.workspace) {
          return { success: false, error: res.error || 'Failed to save configuration.' };
        }

        const updatedWorkspaces = get().workspaces.map((w) => (w.id === activeWorkspace.id ? res.workspace! : w));
        set({
          workspaces: updatedWorkspaces,
          activeWorkspace: res.workspace,
          previewUrlOverride: null,
        });

        await get().addSystemLog(`Visual configuration saved for workspace "${config.name}"`, 'success');
        return { success: true };
      } catch (err: any) {
        console.error('Failed to save workspace config:', err);
        return { success: false, error: err.message || 'Error occurred.' };
      }
    },

    loadEvalsData: async () => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      try {
        const rootPath = activeWorkspace.rootPath || null;
        const presetId = activeWorkspace.id;
        
        const data = await window.api.evals.loadData(rootPath, presetId);
        
        // Populate approval queue dynamically from the runs
        const openApprovals: ApprovalQueueItem[] = [];
        for (const run of data.runs) {
          if (!run.isApproved && !run.isRejected && run.status === 'regression_detected') {
            openApprovals.push({
              id: `app-${run.id}`,
              benchmarkId: run.benchmarkId,
              runId: run.id,
              title: run.triggerContext || 'Evals Run Update',
              previousScore: run.baselineScore,
              currentScore: run.score,
              failuresCount: run.failuresCount,
              status: 'open',
              submittedAt: run.timestamp
            });
          }
        }

        set({
          benchmarks: data.benchmarks || [],
          regressionRuns: data.runs || [],
          failures: data.failures || [],
          approvalQueue: openApprovals
        });
      } catch (err) {
        console.error('Failed to load evals data in store:', err);
      }
    },

    runRegressionSet: async (benchmarkId: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const benchmark = get().benchmarks.find(b => b.id === benchmarkId);
      if (!benchmark) return;

      set({ isRunningBenchmark: true });
      await get().addSystemLog(`Starting regression test run for benchmark "${benchmark.name}"...`, 'info');

      // Simulate a delay of 2.5 seconds
      await new Promise(resolve => setTimeout(resolve, 2500));

      const isRegression = Math.random() > 0.4;
      const newScore = isRegression 
        ? parseFloat((benchmark.baselineScore - 0.03 - Math.random() * 0.05).toFixed(2))
        : parseFloat((benchmark.baselineScore + 0.01 + Math.random() * 0.02).toFixed(2));
      
      const diff = parseFloat((newScore - benchmark.baselineScore).toFixed(2));
      const status = diff < 0 ? 'regression_detected' : 'pass';
      
      const runId = `run-${Date.now()}`;
      const timestamp = new Date().toISOString();

      let failuresCount = 0;
      let newFailure: FailureCase | null = null;

      if (status === 'regression_detected') {
        failuresCount = 1;
        if (activeWorkspace.id === 'sound-machina') {
          newFailure = {
            id: `fail-${Date.now()}`,
            benchmarkId,
            prompt: 'Ambient synth drone',
            expected: 'Low-frequency drone with slow resonant sweep and wide stereo field.',
            actual: 'High-pitch buzzing sound with sharp digital distortion.',
            failureDescription: 'Digital clipping and incorrect frequency balance.',
            resolved: false,
            timestamp
          };
        } else if (activeWorkspace.id === 'tm4') {
          newFailure = {
            id: `fail-${Date.now()}`,
            benchmarkId,
            prompt: 'System Run Architecture Validation',
            expected: 'All output files conform to schemaVersion v2 layout.',
            actual: 'Failed validating preset blocks. Missing schema version parameters.',
            failureDescription: 'Schema validation error on project manifest parsing.',
            resolved: false,
            timestamp
          };
        } else {
          newFailure = {
            id: `fail-${Date.now()}`,
            benchmarkId,
            prompt: 'Standard test input prompt',
            expected: 'Response contains appropriate context values.',
            actual: 'Null or empty response returned.',
            failureDescription: 'Null response execution fault.',
            resolved: false,
            timestamp
          };
        }
      }

      const newRun: RegressionRun = {
        id: runId,
        benchmarkId,
        timestamp,
        score: newScore,
        baselineScore: benchmark.baselineScore,
        diff,
        status,
        failuresCount,
        triggerContext: `Manual Triggered Run`,
        isSimulated: true,
        isApproved: false
      };

      const updatedRuns = [newRun, ...get().regressionRuns];
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      await window.api.evals.saveRegressionHistory(rootPath, presetId, updatedRuns);

      if (newFailure) {
        await window.api.evals.saveFailure(rootPath, presetId, newFailure);
        set(state => ({ failures: [newFailure!, ...state.failures] }));
      }

      let updatedQueue = [...get().approvalQueue];
      if (status === 'regression_detected' || diff < 0) {
        const queueItem: ApprovalQueueItem = {
          id: `app-${runId}`,
          benchmarkId,
          runId,
          title: `Prompt Engine Update (Run #${runId.slice(-4)})`,
          previousScore: benchmark.baselineScore,
          currentScore: newScore,
          failuresCount,
          status: 'open',
          submittedAt: timestamp
        };
        updatedQueue = [queueItem, ...updatedQueue];
      }

      set({
        regressionRuns: updatedRuns,
        approvalQueue: updatedQueue,
        isRunningBenchmark: false
      });

      if (status === 'pass') {
        await get().addSystemLog(`Regression run PASSED with score ${newScore} (baseline ${benchmark.baselineScore})`, 'success');
      } else {
        await get().addSystemLog(`REGRESSION DETECTED: Score dropped to ${newScore} (baseline ${benchmark.baselineScore}, diff ${diff})`, 'error');
      }
    },

    approveRun: async (approvalId: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const queueItem = get().approvalQueue.find(a => a.id === approvalId);
      if (!queueItem) return;

      const updatedQueue = get().approvalQueue.map(item => 
        item.id === approvalId ? { ...item, status: 'approved' as const } : item
      );

      const updatedRuns = get().regressionRuns.map(run => 
        run.id === queueItem.runId ? { ...run, isApproved: true, isRejected: false } : run
      );

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      await window.api.evals.saveRegressionHistory(rootPath, presetId, updatedRuns);

      set({
        approvalQueue: updatedQueue.filter(item => item.status === 'open'),
        regressionRuns: updatedRuns
      });

      await get().addSystemLog(`Evals run ${queueItem.runId} marked as APPROVED`, 'success');
    },

    rejectRun: async (approvalId: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const queueItem = get().approvalQueue.find(a => a.id === approvalId);
      if (!queueItem) return;

      const updatedQueue = get().approvalQueue.map(item => 
        item.id === approvalId ? { ...item, status: 'rejected' as const } : item
      );

      const updatedRuns = get().regressionRuns.map(run => 
        run.id === queueItem.runId ? { ...run, isApproved: false, isRejected: true } : run
      );

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      await window.api.evals.saveRegressionHistory(rootPath, presetId, updatedRuns);

      set({
        approvalQueue: updatedQueue.filter(item => item.status === 'open'),
        regressionRuns: updatedRuns
      });

      await get().addSystemLog(`Evals run ${queueItem.runId} marked as REJECTED`, 'warning');
    },

    promoteToBaseline: async (benchmarkId: string, runId: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const run = get().regressionRuns.find(r => r.id === runId);
      if (!run) return;

      const updatedBenchmarks = get().benchmarks.map(b => 
        b.id === benchmarkId ? { ...b, baselineScore: run.score } : b
      );

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      await window.api.evals.saveBenchmarks(rootPath, presetId, updatedBenchmarks);

      set({ benchmarks: updatedBenchmarks });
      await get().addSystemLog(`Promoted score ${run.score} to baseline for benchmark ${benchmarkId}`, 'success');
    },

    saveFailureCase: async (failure: FailureCase) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const success = await window.api.evals.saveFailure(rootPath, presetId, failure);
      if (success) {
        const exists = get().failures.some(f => f.id === failure.id);
        const updatedFailures = exists
          ? get().failures.map(f => f.id === failure.id ? failure : f)
          : [failure, ...get().failures];
        
        set({ failures: updatedFailures });
        await get().addSystemLog(`Failure case ${failure.id} saved successfully`, 'success');
      }
    },

    deleteFailureCase: async (failureId: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const success = await window.api.evals.deleteFailure(rootPath, presetId, failureId);
      if (success) {
        set(state => ({
          failures: state.failures.filter(f => f.id !== failureId)
        }));
        await get().addSystemLog(`Failure case ${failureId} deleted`, 'info');
      }
    },

    createBenchmark: async (benchmark: BenchmarkDefinition) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const updatedBenchmarks = [...get().benchmarks, benchmark];
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const success = await window.api.evals.saveBenchmarks(rootPath, presetId, updatedBenchmarks);
      if (success) {
        set({ benchmarks: updatedBenchmarks });
        await get().addSystemLog(`Benchmark "${benchmark.name}" created successfully`, 'success');
      }
    }
  };
});
