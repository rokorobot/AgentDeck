import { create } from 'zustand';
import { Workspace, ManagedProcess } from '../types/workspace';
import { checkCommandSafety } from '../lib/commandSafety';
import { isManagedProcessSessionId } from '../lib/terminalSessionKind';
import { BenchmarkDefinition, RegressionRun, ApprovalQueueItem, FailureCase, GoldStandard, JudgeDefinition, PromotionHistoryRecord, TestCaseRunResult, BenchmarkReport, BenchmarkTestCase } from '../types/evals';
import { TimelineEvent } from '../types/timeline';
import { GovernancePolicy, ReleaseCandidate } from '../types/governance';
import { SnapshotManifest, SnapshotPayload } from '../types/snapshot';
import { createDoctorSlice, DoctorSlice } from './slices/doctorSlice';
import { createProvenanceSlice, ProvenanceSlice } from './slices/provenanceSlice';
import { createDepSlice, DepSlice } from './slices/depSlice';
import { createAgentsSlice, AgentsSlice } from './slices/agentsSlice';

// The global `window.api` (Electron preload bridge) type augmentation lives in
// src/types/windowApi.d.ts (W6-3 p0). It is ambient and picked up via tsconfig
// `include`, so no import is needed here.

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

// WorkspaceStore is exported (type-only) so domain slices can type themselves
// as WorkspaceSliceCreator<WorkspaceStore, TSlice> — additive, does not change
// the runtime hook identity, store shape, action names, or consumer API.
export interface WorkspaceStore extends DoctorSlice, ProvenanceSlice, DepSlice, AgentsSlice {
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
  goldStandards: GoldStandard[];
  judges: JudgeDefinition[];
  promotions: PromotionHistoryRecord[];
  isRunningBenchmark: boolean;
  loadEvalsData(): Promise<void>;
  runRegressionSet(benchmarkId: string): Promise<void>;
  approveRun(approvalId: string): Promise<void>;
  rejectRun(approvalId: string): Promise<void>;
  promoteToBaseline(benchmarkId: string, runId: string, reason?: string): Promise<void>;
  saveFailureCase(failure: FailureCase): Promise<void>;
  deleteFailureCase(failureId: string): Promise<void>;
  createBenchmark(benchmark: BenchmarkDefinition): Promise<void>;
  saveGoldStandard(item: GoldStandard): Promise<void>;
  deleteGoldStandard(id: string): Promise<void>;
  saveJudge(judge: JudgeDefinition): Promise<void>;
  deleteJudge(id: string): Promise<void>;
  convertFailureToTestCase(failureId: string, benchmarkId: string, threshold: number): Promise<void>;

  // Timeline State & Actions
  timelineEvents: TimelineEvent[];
  addTimelineEvent(
    type: TimelineEvent['type'],
    referenceId: string,
    summary: string,
    metadata?: any,
    severity?: TimelineEvent['severity'],
    actor?: TimelineEvent['actor']
  ): Promise<TimelineEvent | undefined>;

  // Governance State & Actions
  governancePolicies: GovernancePolicy | null;
  releaseCandidates: ReleaseCandidate[];
  saveGovernancePolicies(policies: GovernancePolicy): Promise<void>;
  createReleaseCandidate(candidate: Omit<ReleaseCandidate, 'schemaVersion' | 'timestamp' | 'status'>): Promise<void>;
  updateReleaseCandidateStatus(id: string, status: ReleaseCandidate['status'], notes?: string): Promise<void>;
  sealGovernanceRecords(): Promise<void>;

  // Snapshots State & Actions
  snapshotsList: SnapshotManifest[];
  loadSnapshots(): Promise<void>;
  createSnapshot(description: string, type?: SnapshotManifest['type'], parentSnapshotId?: string): Promise<void>;
  restoreSnapshot(snapshotId: string): Promise<{ success: boolean; error?: string }>;

  // Provenance State & Actions — provided by ProvenanceSlice (see `extends` above / src/store/slices/provenanceSlice.ts)

  // Doctor State & Actions — provided by DoctorSlice (see `extends` above / src/store/slices/doctorSlice.ts)

  // Decision Evidence Package (DEP) State & Actions — provided by DepSlice (see `extends` above / src/store/slices/depSlice.ts)

  // Agent Workspace State & Actions — provided by AgentsSlice (see `extends` above / src/store/slices/agentsSlice.ts)
}

const terminalLineBuffers: Record<string, string> = {};

export const useWorkspaceStore = create<WorkspaceStore>((set, get, store) => {
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
    goldStandards: [],
    judges: [],
    promotions: [],
    isRunningBenchmark: false,
    timelineEvents: [],
    governancePolicies: null,
    releaseCandidates: [],
    snapshotsList: [],

    // Domain slices (W6-3) — spread into the same store object so the single
    // shared (set, get) closure is preserved.
    //   Doctor: doctorReport + runDoctorChecks / repairWorkspaceCheck /
    //     exportDiagnosticBundle.
    //   Provenance: provenanceList + loadProvenance / recordProvenance (the
    //     latter is an inbound utility other domains call via get()).
    //   DEP: decisionEvidenceList + load/generate/signAndSave/verify/exportJson/
    //     exportMarkdown (signAndSave refreshes governance releaseCandidates on
    //     success — existing cross-domain behavior, preserved).
    //   Agents: agentSessions + agentWindows + addAgent/updateAgent/removeAgent/
    //     startAgentSession/stopAgentSession (no direct IPC; persists via
    //     get().saveActiveWorkspace and calls core createTerminal/killTerminal).
    ...createDoctorSlice(set, get, store),
    ...createProvenanceSlice(set, get, store),
    ...createDepSlice(set, get, store),
    ...createAgentsSlice(set, get, store),

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
        // If it's a managed process, preserve it!
        if (!isManagedProcessSessionId(session.id)) {
          await window.api.terminal.kill(session.id);
        }
      }

      set({
        activeWorkspace: workspace,
        terminalSessions: get().terminalSessions.filter((s) => isManagedProcessSessionId(s.id)),
        activeTerminalTabId: null,
        previewUrlOverride: null,
      });

      // Spawning default TTY terminals
      const spawnedSessions: TerminalSessionState[] = [];
      let firstTabId: string | null = null;

      for (const preset of workspace.terminals ?? []) {
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
      const termId = `term-${workspaceId}-user-${crypto.randomUUID()}`;

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
        const isManaged = isManagedProcessSessionId(id);
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
      console.log('[AgentDeck] Discover folder clicked');
      try {
        const folderPath = await window.api.workspaces.openDirectory();
        console.log('[AgentDeck] selected folder:', folderPath);
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
        await get().addTimelineEvent(
          'service_started',
          proc.id,
          `Service started: "${cmd.label}" (PID: ${proc.pid})`,
          {
            commandId: cmd.id,
            label: cmd.label,
            pid: proc.pid
          }
        );
      } catch (e) {
        console.error('Failed to spawn process:', e);
      }
    },

    stopManagedProcess: async (runId: string) => {
      try {
        const proc = get().managedProcesses.find((p) => p.id === runId);
        const label = proc?.label || runId;

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

          await get().addTimelineEvent(
            'service_stopped',
            runId,
            `Service stopped: "${label}"`,
            {
              runId,
              label
            }
          );
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
        const timelineEvent = await get().addTimelineEvent(
          'manifest_saved',
          activeWorkspace.id,
          `Workspace manifest configuration saved for "${config.name}"`,
          {
            configSnapshot: config
          }
        );

        if (timelineEvent) {
          await get().recordProvenance(
            'manifest_saved',
            'manifest',
            activeWorkspace.id,
            { manifestId: activeWorkspace.id },
            { manifestId: config.id, name: config.name }
          );
        }

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

        const timelineEvents = await window.api.timeline.loadEvents(rootPath, presetId);
        const govData = await window.api.governance.loadData(rootPath, presetId);
        const snapshots = await window.api.snapshots.loadAll(rootPath, presetId);
        const provenance = await window.api.provenance.loadAll(rootPath, presetId);
        const deps = await window.api.dep.loadAll(rootPath, presetId);

        set({
          benchmarks: data.benchmarks || [],
          regressionRuns: data.runs || [],
          failures: data.failures || [],
          goldStandards: data.goldStandards || [],
          judges: data.judges || [],
          promotions: data.promotions || [],
          timelineEvents: timelineEvents || [],
          governancePolicies: govData.policies,
          releaseCandidates: govData.releaseCandidates || [],
          snapshotsList: snapshots || [],
          provenanceList: provenance || [],
          approvalQueue: openApprovals,
          decisionEvidenceList: deps || []
        });

        // Trigger doctor checks on data refresh
        await get().runDoctorChecks();
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
      
      const runId = `run-${crypto.randomUUID()}`;
      const timestamp = new Date().toISOString();

      let failuresCount = 0;
      let newFailure: FailureCase | null = null;

      if (status === 'regression_detected') {
        failuresCount = 1;
        if (activeWorkspace.id === 'sound-machina') {
          newFailure = {
            id: `fail-${crypto.randomUUID()}`,
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
            id: `fail-${crypto.randomUUID()}`,
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
            id: `fail-${crypto.randomUUID()}`,
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

      // Generate test cases run results
      const testCasesList = benchmark.testCases || [];
      const testCaseResults: TestCaseRunResult[] = [];
      let passedCount = 0;

      if (testCasesList.length > 0) {
        testCasesList.forEach((tc) => {
          const scoreOffset = isRegression ? -0.05 - Math.random() * 0.05 : 0.02 + Math.random() * 0.05;
          const caseScore = parseFloat(Math.min(1.0, Math.max(0.0, tc.threshold + scoreOffset)).toFixed(2));
          const caseStatus = caseScore >= tc.threshold ? 'pass' as const : 'fail' as const;
          
          if (caseStatus === 'pass') passedCount++;
          
          testCaseResults.push({
            caseId: tc.id,
            prompt: tc.prompt,
            status: caseStatus,
            score: caseScore,
            isImproved: caseStatus === 'pass' && Math.random() > 0.6,
            isRegressed: caseStatus === 'fail' && Math.random() > 0.4
          });
        });
      } else {
        const defaultPrompts = [
          { id: 'mock-tc-1', prompt: 'Default validation case 1', threshold: 0.80 },
          { id: 'mock-tc-2', prompt: 'Default validation case 2', threshold: 0.82 },
          { id: 'mock-tc-3', prompt: 'Default validation case 3', threshold: 0.78 }
        ];
        defaultPrompts.forEach((tc) => {
          const scoreOffset = isRegression ? -0.04 - Math.random() * 0.05 : 0.02 + Math.random() * 0.05;
          const caseScore = parseFloat(Math.min(1.0, Math.max(0.0, tc.threshold + scoreOffset)).toFixed(2));
          const caseStatus = caseScore >= tc.threshold ? 'pass' as const : 'fail' as const;
          
          if (caseStatus === 'pass') passedCount++;
          
          testCaseResults.push({
            caseId: tc.id,
            prompt: tc.prompt,
            status: caseStatus,
            score: caseScore,
            isImproved: caseStatus === 'pass' && Math.random() > 0.7,
            isRegressed: caseStatus === 'fail' && Math.random() > 0.5
          });
        });
      }

      const totalCases = testCaseResults.length;
      const passRate = totalCases > 0 ? parseFloat(((passedCount / totalCases) * 100).toFixed(0)) : 100;

      const report: BenchmarkReport = {
        passRate,
        baselineScore: benchmark.baselineScore,
        currentScore: newScore,
        results: testCaseResults
      };

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
        isApproved: false,
        report
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

      const timelineEv = await get().addTimelineEvent(
        'regression_executed',
        runId,
        `Regression run completed for ${benchmark.name}: ${newScore} (baseline: ${benchmark.baselineScore}, diff: ${diff > 0 ? '+' : ''}${diff})`,
        {
          benchmarkId,
          runId,
          score: newScore,
          baselineScore: benchmark.baselineScore,
          diff,
          failuresCount,
          passRate,
          status,
          runDetails: newRun
        }
      );

      // Governance Release Candidate Policy Evaluation
      const policies = get().governancePolicies;
      if (policies) {
        const meetsMinScore = newScore >= policies.minScore;
        const isRegressionRun = status === 'regression_detected' || diff < 0;
        
        const shouldCreateRC = policies.requireApproval || !meetsMinScore || isRegressionRun;
        
        if (shouldCreateRC) {
          let policyResult: ReleaseCandidate['policyResult'] = 'pass';
          const policyReasons: string[] = [];
          
          if (!meetsMinScore) {
            policyResult = 'blocked';
            policyReasons.push(`Score ${newScore} is below governance minimum score threshold of ${policies.minScore}`);
          }
          
          if (isRegressionRun && !policies.allowRegression) {
            policyResult = 'blocked';
            policyReasons.push(`Regression detected (${diff > 0 ? '+' : ''}${diff}) and regression is disallowed by policy`);
          }
          
          if (policyResult !== 'blocked' && policies.requireApproval) {
            policyResult = 'requires_approval';
            policyReasons.push(`Governance policy requires explicit operator approval for all release candidates`);
          }
          
          if (policyResult === 'pass') {
            policyReasons.push(`All policy metrics and regression gates passed`);
          }

          const candidateId = `rc-${crypto.randomUUID()}`;
          const rcCount = get().releaseCandidates.length + 1;
          const version = `v${totalCases > 0 ? '1.0' : '0.9'}.${rcCount}-rc${rcCount}`;
          
          const newCandidate: ReleaseCandidate = {
            id: candidateId,
            schemaVersion: 'agentdeck.governance.v1',
            version,
            timestamp: new Date().toISOString(),
            status: 'pending',
            score: newScore,
            benchmarkId,
            failuresCount,
            timelineEventId: timelineEv ? timelineEv.id : `evt-${runId}`,
            policyResult,
            policyReasons,
            baselineScore: benchmark.baselineScore,
            regressionDelta: diff
          };
          
          const updatedCandidates = [newCandidate, ...get().releaseCandidates];
          await window.api.governance.saveCandidates(rootPath, presetId, updatedCandidates);
          
          set({ releaseCandidates: updatedCandidates });
          await get().addSystemLog(`Governance alert: Spawning Release Candidate ${version} (${policyResult.toUpperCase()})`, 'info');
          
          await get().addTimelineEvent(
            'release_candidate_created',
            candidateId,
            `Release Candidate ${version} spawned in queue (Policy evaluation: ${policyResult.toUpperCase()})`,
            {
              candidateId,
              version,
              score: newScore,
              policyResult,
              reasons: policyReasons
            },
            policyResult === 'blocked' ? 'warning' : 'info'
          );
        }
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
      await get().addTimelineEvent(
        'run_approved',
        queueItem.runId,
        `Evaluations run approved: ${queueItem.title} (${queueItem.previousScore} -> ${queueItem.currentScore})`,
        {
          runId: queueItem.runId,
          benchmarkId: queueItem.benchmarkId,
          previousScore: queueItem.previousScore,
          currentScore: queueItem.currentScore
        }
      );
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
      await get().addTimelineEvent(
        'run_rejected',
        queueItem.runId,
        `Evaluations run rejected: ${queueItem.title} (${queueItem.previousScore} &rarr; ${queueItem.currentScore})`,
        {
          runId: queueItem.runId,
          benchmarkId: queueItem.benchmarkId,
          previousScore: queueItem.previousScore,
          currentScore: queueItem.currentScore
        }
      );
    },

    promoteToBaseline: async (benchmarkId: string, runId: string, reason?: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const run = get().regressionRuns.find(r => r.id === runId);
      if (!run) return;

      const targetBenchmark = get().benchmarks.find(b => b.id === benchmarkId);
      const benchmarkName = targetBenchmark?.name || benchmarkId;
      const oldScore = targetBenchmark?.baselineScore || 0;

      const updatedBenchmarks = get().benchmarks.map(b => 
        b.id === benchmarkId ? { ...b, baselineScore: run.score } : b
      );

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      await window.api.evals.saveBenchmarks(rootPath, presetId, updatedBenchmarks);

      const record: PromotionHistoryRecord = {
        timestamp: new Date().toISOString(),
        benchmarkId,
        benchmarkName,
        oldScore,
        newScore: run.score,
        approvedBy: 'operator',
        reason: reason || 'Manual promotion override',
        runId
      };

      const updatedPromotions = [record, ...get().promotions];
      await window.api.evals.savePromotions(rootPath, presetId, updatedPromotions);

      set({ 
        benchmarks: updatedBenchmarks,
        promotions: updatedPromotions
      });
      await get().addSystemLog(`Promoted score ${run.score} to baseline for benchmark ${benchmarkId}`, 'success');
      
      const timelineEvent = await get().addTimelineEvent(
        'baseline_promoted',
        runId,
        `Baseline target score promoted for ${benchmarkName}: ${oldScore} -> ${run.score}`,
        {
          benchmarkId,
          benchmarkName,
          oldScore,
          newScore: run.score,
          reason: reason || 'Manual promotion override',
          runId
        }
      );

      if (timelineEvent) {
        await get().recordProvenance(
          'baseline_promoted',
          'timeline_event',
          timelineEvent.id,
          { score: oldScore },
          { score: run.score, reason: reason || 'Manual promotion override', runId }
        );
      }
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
    },

    saveGoldStandard: async (item: GoldStandard) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const oldItem = get().goldStandards.find(g => g.id === item.id);
      const success = await window.api.evals.saveGoldStandard(rootPath, presetId, item);
      if (success) {
        const exists = get().goldStandards.some(g => g.id === item.id);
        const updated = exists
          ? get().goldStandards.map(g => g.id === item.id ? item : g)
          : [item, ...get().goldStandards];
        set({ goldStandards: updated });
        await get().addSystemLog(`Gold standard "${item.title}" saved successfully`, 'success');
        
        await get().recordProvenance(
          'gold_standard_saved',
          'gold_standard',
          item.id,
          oldItem ? { title: oldItem.title, tags: oldItem.tags } : null,
          { title: item.title, tags: item.tags }
        );
      }
    },

    deleteGoldStandard: async (id: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const oldItem = get().goldStandards.find(g => g.id === id);
      const success = await window.api.evals.deleteGoldStandard(rootPath, presetId, id);
      if (success) {
        set(state => ({
          goldStandards: state.goldStandards.filter(g => g.id !== id)
        }));
        await get().addSystemLog(`Gold standard deleted`, 'info');
        
        if (oldItem) {
          await get().recordProvenance(
            'gold_standard_deleted',
            'gold_standard',
            id,
            { title: oldItem.title, tags: oldItem.tags },
            null
          );
        }
      }
    },

    saveJudge: async (judge: JudgeDefinition) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const exists = get().judges.some(j => j.id === judge.id);
      const updated = exists
        ? get().judges.map(j => j.id === judge.id ? judge : j)
        : [...get().judges, judge];

      const success = await window.api.evals.saveJudges(rootPath, presetId, updated);
      if (success) {
        set({ judges: updated });
        await get().addSystemLog(`Judge "${judge.name}" saved successfully`, 'success');
      }
    },

    deleteJudge: async (id: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const updated = get().judges.filter(j => j.id !== id);
      const success = await window.api.evals.saveJudges(rootPath, presetId, updated);
      if (success) {
        set({ judges: updated });
        await get().addSystemLog(`Judge deleted`, 'info');
      }
    },

    convertFailureToTestCase: async (failureId: string, benchmarkId: string, threshold: number) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const failure = get().failures.find(f => f.id === failureId);
      if (!failure) return;

      const testCaseId = `tc-${crypto.randomUUID()}`;
      const testCase: BenchmarkTestCase = {
        id: testCaseId,
        benchmarkId,
        sourceFailureId: failureId,
        prompt: failure.prompt,
        expected: failure.expected || failure.resolution || 'Resolved prompt validation case.',
        threshold
      };

      // Append test case to the target benchmark
      const updatedBenchmarks = get().benchmarks.map(b => {
        if (b.id === benchmarkId) {
          const testCases = b.testCases || [];
          return {
            ...b,
            testCases: [...testCases, testCase],
            goldStandardsCount: (b.goldStandardsCount || 0) + 1
          };
        }
        return b;
      });

      // Update failure state
      const updatedFailure: FailureCase = {
        ...failure,
        resolved: true,
        converted: true,
        convertedToBenchmarkId: benchmarkId,
        convertedToTestCaseId: testCaseId
      };

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      const successBenchmarks = await window.api.evals.saveBenchmarks(rootPath, presetId, updatedBenchmarks);
      const successFailure = await window.api.evals.saveFailure(rootPath, presetId, updatedFailure);

      if (successBenchmarks && successFailure) {
        set(state => ({
          benchmarks: updatedBenchmarks,
          failures: state.failures.map(f => f.id === failureId ? updatedFailure : f)
        }));
        await get().addSystemLog(`Converted failure case to test case inside benchmark ${benchmarkId}`, 'success');
        const timelineEvent = await get().addTimelineEvent(
          'failure_converted',
          failureId,
          `Converted failure case ${failureId} to a test case inside benchmark ${benchmarkId}`,
          {
            benchmarkId,
            testCaseId,
            prompt: failure.prompt,
            expected: testCase.expected,
            threshold
          }
        );

        if (timelineEvent) {
          await get().recordProvenance(
            'failure_converted',
            'timeline_event',
            timelineEvent.id,
            { failureId, status: 'unresolved' },
            { benchmarkId, testCaseId, expected: testCase.expected }
          );
        }
      }
    },

    addTimelineEvent: async (
      type: TimelineEvent['type'],
      referenceId: string,
      summary: string,
      metadata?: any,
      severity?: TimelineEvent['severity'],
      actor?: TimelineEvent['actor']
    ) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;

      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;

      // Capture logs snapshot (latest 30 lines max)
      const logsSnapshot: string[] = [];
      const runtimeLogs = get().runtimeLogs;
      const systemLogs = get().systemLogs;
      
      const sourceLogs = runtimeLogs.length > 0 ? runtimeLogs : systemLogs;
      const startIdx = Math.max(0, sourceLogs.length - 30);
      for (let i = startIdx; i < sourceLogs.length; i++) {
        const item = sourceLogs[i];
        if (typeof item === 'string') {
          logsSnapshot.push(item);
        } else if (item && typeof item === 'object') {
          const time = item.timestamp ? `[${new Date(item.timestamp).toLocaleTimeString()}] ` : '';
          const lvl = item.type ? `[${item.type}] ` : '';
          logsSnapshot.push(`${time}${lvl}${item.message || JSON.stringify(item)}`);
        }
      }

      // Default severity mapping
      let finalSeverity: TimelineEvent['severity'] = severity || 'info';
      if (!severity) {
        if (type === 'baseline_promoted' || type === 'failure_converted' || type === 'run_approved') {
          finalSeverity = 'success';
        } else if (type === 'run_rejected') {
          finalSeverity = 'warning';
        } else if (type === 'regression_executed') {
          if (metadata && metadata.failuresCount > 0) {
            finalSeverity = 'warning';
          } else {
            finalSeverity = 'success';
          }
        }
      }

      // Default actor mapping
      const finalActor: TimelineEvent['actor'] = actor || (type === 'regression_executed' ? 'simulator' : 'operator');

      const event: TimelineEvent = {
        id: `evt-${crypto.randomUUID()}`,
        schemaVersion: 'agentdeck.timeline.v1',
        timestamp: new Date().toISOString(),
        workspaceId: activeWorkspace.id,
        type,
        severity: finalSeverity,
        actor: finalActor,
        referenceId,
        summary,
        metadata: {
          ...metadata,
          logsSnapshot
        }
      };

      const success = await window.api.timeline.saveEvent(rootPath, presetId, event);
      if (success) {
        set(state => ({
          timelineEvents: [event, ...state.timelineEvents]
        }));
      }
      return event; // Return event for linking
    },

    saveGovernancePolicies: async (policies: GovernancePolicy) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;
      const oldPolicies = get().governancePolicies;
      const success = await window.api.governance.savePolicies(rootPath, presetId, policies);
      if (success) {
        set({ governancePolicies: policies });
        await get().addSystemLog('Governance policies updated successfully', 'success');
        const timelineEvent = await get().addTimelineEvent(
          'manifest_saved',
          activeWorkspace.id,
          `Governance policies updated (minScore: ${policies.minScore}, requireApproval: ${policies.requireApproval}, allowRegression: ${policies.allowRegression})`,
          { policies }
        );
        
        if (timelineEvent) {
          await get().recordProvenance(
            'policy_updated',
            'policy',
            activeWorkspace.id,
            oldPolicies || {},
            policies
          );
        }
      }
    },

    createReleaseCandidate: async (candidate: Omit<ReleaseCandidate, 'schemaVersion' | 'timestamp' | 'status'>) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;
      
      const newCandidate: ReleaseCandidate = {
        ...candidate,
        schemaVersion: 'agentdeck.governance.v1',
        timestamp: new Date().toISOString(),
        status: 'pending'
      };
      
      const updatedCandidates = [newCandidate, ...get().releaseCandidates];
      const success = await window.api.governance.saveCandidates(rootPath, presetId, updatedCandidates);
      if (success) {
        set({ releaseCandidates: updatedCandidates });
        await get().addSystemLog(`Release Candidate ${candidate.version} created inside queue`, 'info');
      }
    },

    updateReleaseCandidateStatus: async (id: string, status: ReleaseCandidate['status'], notes?: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;
      
      const candidate = get().releaseCandidates.find(c => c.id === id);
      if (!candidate) return;

      // Enforce lifecycle rules: pending -> approved -> released, pending -> rejected
      if (status === 'approved' && candidate.status !== 'pending') {
        await get().addSystemLog(`Lifecycle check failed: Candidate must be PENDING to be APPROVED.`, 'error');
        return;
      }
      if (status === 'rejected' && candidate.status !== 'pending') {
        await get().addSystemLog(`Lifecycle check failed: Candidate must be PENDING to be REJECTED.`, 'error');
        return;
      }
      if (status === 'released' && candidate.status !== 'approved') {
        await get().addSystemLog(`Lifecycle check failed: Candidate must be APPROVED to be RELEASED.`, 'error');
        return;
      }
      
      const updatedCandidates = get().releaseCandidates.map(c => {
        if (c.id === id) {
          return {
            ...c,
            status,
            notes: notes || c.notes,
            approvedBy: 'operator',
            approvedAt: new Date().toISOString()
          };
        }
        return c;
      });
      
      const success = await window.api.governance.saveCandidates(rootPath, presetId, updatedCandidates);
      if (success) {
        set({ releaseCandidates: updatedCandidates });
        await get().addSystemLog(`Release Candidate ${candidate.version} status updated to "${status.toUpperCase()}"`, 'success');
        
        let timelineType: TimelineEvent['type'] = 'release_candidate_approved';
        let severity: TimelineEvent['severity'] = 'success';
        
        if (status === 'approved') {
          timelineType = 'release_candidate_approved';
          severity = 'success';
        } else if (status === 'rejected') {
          timelineType = 'release_candidate_rejected';
          severity = 'warning';
        } else if (status === 'released') {
          timelineType = 'release_candidate_released';
          severity = 'success';
        }
        
        const timelineEvent = await get().addTimelineEvent(
          timelineType,
          id,
          `Release Candidate ${candidate.version} marked as ${status.toUpperCase()} (Score: ${candidate.score})`,
          {
            candidateId: id,
            version: candidate.version,
            status,
            notes
          },
          severity
        );
        
        if (timelineEvent) {
          await get().recordProvenance(
            'release_candidate_updated',
            'release_candidate',
            id,
            { status: candidate.status },
            { status }
          );
        }
      }
    },

    sealGovernanceRecords: async () => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;
      
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;
      
      await get().addSystemLog('Recomputing governance record checksums...', 'info');

      // 1. Recompute policy checksums
      if (get().governancePolicies) {
        await get().saveGovernancePolicies(get().governancePolicies!);
      }

      // 2. Recompute release candidate checksums
      if (get().releaseCandidates.length > 0) {
        await window.api.governance.saveCandidates(rootPath, presetId, get().releaseCandidates);
      }

      // 3. Recompute timeline event checksums
      if (get().timelineEvents.length > 0) {
        for (const evt of get().timelineEvents) {
          await window.api.timeline.saveEvent(rootPath, presetId, evt);
        }
      }

      await get().addSystemLog('Recomputed integrity checksums for all governance, candidate, and timeline event records.', 'success');
      
      // Reload everything to fetch updated verification statuses from backend
      await get().loadEvalsData();
    },

    loadSnapshots: async () => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;
      
      const snapshots = await window.api.snapshots.loadAll(rootPath, presetId);
      set({ snapshotsList: snapshots || [] });
    },

    createSnapshot: async (description: string, type: SnapshotManifest['type'] = 'manual', parentSnapshotId?: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return;
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;
      
      await get().addSystemLog(`Capturing workspace snapshot [Type: ${type.toUpperCase()}]...`, 'info');
      
      // Build the payload
      const payload: SnapshotPayload = {
        manifest: activeWorkspace,
        benchmarks: get().benchmarks,
        failures: get().failures,
        goldStandards: get().goldStandards,
        judges: get().judges,
        promotions: get().promotions,
        regressionRuns: get().regressionRuns,
        policies: get().governancePolicies,
        releaseCandidates: get().releaseCandidates,
        timelineEvents: get().timelineEvents
      };
      
      try {
        const manifest = await window.api.snapshots.create(rootPath, presetId, description, type, payload, parentSnapshotId);
        await get().addSystemLog(`Workspace snapshot "${description}" created successfully (ID: ${manifest.snapshotId}).`, 'success');
        
        // Log to timeline
        await get().addTimelineEvent(
          'snapshot_created',
          manifest.snapshotId,
          `Captured workspace snapshot [${type.toUpperCase()}]: ${description}`,
          {
            snapshotId: manifest.snapshotId,
            description,
            type,
            parentSnapshotId
          },
          'success'
        );
        
        await get().loadSnapshots();
      } catch (err: any) {
        await get().addSystemLog(`Failed to create snapshot: ${err.message}`, 'error');
        throw err;
      }
    },

    restoreSnapshot: async (snapshotId: string) => {
      const activeWorkspace = get().activeWorkspace;
      if (!activeWorkspace) return { success: false, error: 'No active workspace selected.' };
      const rootPath = activeWorkspace.rootPath || null;
      const presetId = activeWorkspace.id;
      
      // Look up description of snapshot to restore
      const targetSnap = get().snapshotsList.find(s => s.snapshotId === snapshotId);
      const snapDesc = targetSnap ? targetSnap.description : 'Unknown Snapshot';
      
      await get().addSystemLog(`Initiating restore of snapshot ${snapshotId} ("${snapDesc}")...`, 'info');
      
      // 1. Create automatic pre-restore safety backup linked to target snapshot ID
      try {
        await get().createSnapshot(
          `Auto-backup before restoring snapshot ${snapshotId} ("${snapDesc}")`,
          'pre-restore',
          snapshotId
        );
      } catch (backupErr: any) {
        await get().addSystemLog(`Pre-restore safety backup failed, aborting restore: ${backupErr.message}`, 'error');
        return { success: false, error: `Pre-restore safety backup failed: ${backupErr.message}` };
      }
      
      // 2. Perform restoration
      const result = await window.api.snapshots.restore(rootPath, presetId, snapshotId);
      
      if (result.success) {
        await get().addSystemLog(`Workspace state successfully restored to snapshot ${snapshotId}.`, 'success');
        
        // Reload all data from files
        await get().loadEvalsData();
        
        // 3. Log snapshot_restored timeline event
        const timelineEvent = await get().addTimelineEvent(
          'snapshot_restored',
          snapshotId,
          `Restored workspace state to snapshot ${snapshotId} ("${snapDesc}")`,
          {
            snapshotId,
            description: snapDesc
          },
          'success'
        );

        if (timelineEvent) {
          await get().recordProvenance(
            'snapshot_restored',
            'snapshot',
            snapshotId,
            { snapshotId: null }, // Unknown state before restore
            { snapshotId, description: snapDesc }
          );
        }
        
        return { success: true };
      } else {
        await get().addSystemLog(`Restore blocked or failed: ${result.error}`, 'error');
        
        // Log snapshot_restore_blocked timeline event
        await get().addTimelineEvent(
          'snapshot_restore_blocked',
          snapshotId,
          `Failed/blocked restoration of snapshot ${snapshotId} ("${snapDesc}"): ${result.error}`,
          {
            snapshotId,
            description: snapDesc,
            error: result.error
          },
          'error'
        );
        
        return { success: false, error: result.error };
      }
    },

  };
});
