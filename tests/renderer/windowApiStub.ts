import { vi } from 'vitest';

/**
 * Deterministic, Electron-free stub of the `window.api` surface that
 * electron/preload.ts exposes and src/store/workspaceStore.ts consumes.
 *
 * Every method is a vi.fn() so tests can assert delegation (e.g. that
 * addTimelineEvent calls timeline.saveEvent). Defaults are benign: readers
 * return empty collections / nulls, writers return success, and the on*
 * subscription registrars are no-ops. No real IPC, no filesystem, no timers.
 *
 * Overrides let a test shape a specific response, e.g.:
 *   installWindowApiStub({ evals: { loadData: async () => ({ benchmarks: [...] }) } })
 */

export interface WindowApiStubOverrides {
  [namespace: string]: Record<string, (...args: any[]) => any>;
}

export function makeWindowApiStub(overrides: WindowApiStubOverrides = {}) {
  const api: any = {
    workspaces: {
      loadAll: vi.fn(async () => []),
      load: vi.fn(async () => null),
      openDirectory: vi.fn(async () => null),
      loadFromPath: vi.fn(async () => null),
      checkConfig: vi.fn(async () => ({ exists: false })),
      initialize: vi.fn(async () => ({ success: true })),
      save: vi.fn(async () => ({ success: true })),
      scanAgentTopology: vi.fn(async () => ({ suggestions: [] })),
    },
    layout: {
      save: vi.fn(async () => true),
      // The real layout:load handler always returns an object (its default when
      // no file exists), never null — the store reads savedLayout.workspacePaths
      // etc. during init(). Mirror that contract here.
      load: vi.fn(async () => ({
        activeWorkspaceId: 'tm4',
        sidebarWidth: 210,
        activeTerminalTabId: null,
        terminalWidthPercent: 50,
        logsHeightPercent: 22,
        workspacePaths: [],
      })),
    },
    logs: {
      save: vi.fn(async () => true),
      load: vi.fn(async () => []),
      add: vi.fn(async () => ({ id: 'log-stub' })),
      onLogsChanged: vi.fn(() => () => {}),
    },
    ollama: {
      checkStatus: vi.fn(async () => ({ running: false, models: [] })),
    },
    ports: {
      checkHealth: vi.fn(async () => ({ online: false })),
    },
    process: {
      start: vi.fn(async () => null),
      stop: vi.fn(async () => true),
      restart: vi.fn(async () => null),
      list: vi.fn(async () => []),
      onStateChanged: vi.fn(() => () => {}),
    },
    ide: {
      open: vi.fn(async () => ({ success: true })),
    },
    terminal: {
      create: vi.fn(async () => ({ id: 'term-stub', type: 'node-pty' })),
      write: vi.fn(() => {}),
      resize: vi.fn(() => {}),
      kill: vi.fn(async () => true),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      onFallbackRecreated: vi.fn(() => () => {}),
    },
    safety: {
      approveCommand: vi.fn(async () => true),
    },
    evals: {
      loadData: vi.fn(async () => ({
        benchmarks: [], runs: [], failures: [], goldStandards: [], judges: [], promotions: [],
      })),
      saveBenchmarks: vi.fn(async () => true),
      saveFailure: vi.fn(async () => true),
      deleteFailure: vi.fn(async () => true),
      saveRegressionHistory: vi.fn(async () => true),
      saveGoldStandard: vi.fn(async () => true),
      deleteGoldStandard: vi.fn(async () => true),
      saveJudges: vi.fn(async () => true),
      savePromotions: vi.fn(async () => true),
    },
    timeline: {
      loadEvents: vi.fn(async () => []),
      saveEvent: vi.fn(async () => true),
    },
    governance: {
      loadData: vi.fn(async () => ({ policies: null, releaseCandidates: [] })),
      savePolicies: vi.fn(async () => true),
      saveCandidates: vi.fn(async () => true),
    },
    snapshots: {
      loadAll: vi.fn(async () => []),
      create: vi.fn(async () => ({ snapshotId: 'snap-stub' })),
      restore: vi.fn(async () => ({ success: true })),
      loadPayload: vi.fn(async () => ({})),
    },
    provenance: {
      loadAll: vi.fn(async () => []),
      recordMutation: vi.fn(async () => ({ id: 'prov-stub' })),
      seal: vi.fn(async () => ({ success: true, sealedCount: 0 })),
    },
    doctor: {
      runChecks: vi.fn(async () => ({ status: 'healthy', timestamp: 0, checks: [] })),
      repair: vi.fn(async () => ({ success: true })),
      exportDiagnosticBundle: vi.fn(async () => ({ success: false, error: 'stub' })),
    },
    dep: {
      generate: vi.fn(async () => ({ id: 'DEP-stub' })),
      signAndSave: vi.fn(async () => ({ success: true })),
      loadAll: vi.fn(async () => []),
      verify: vi.fn(async () => ({ success: true, integrityStatus: 'verified' })),
      exportJson: vi.fn(async () => ({ success: false, error: 'stub' })),
      exportMarkdown: vi.fn(async () => ({ success: false, error: 'stub' })),
    },
  };

  // Shallow-merge per-namespace overrides over the defaults.
  for (const [ns, methods] of Object.entries(overrides)) {
    api[ns] = { ...(api[ns] ?? {}), ...methods };
  }
  return api;
}

/** Install the stub on globalThis.window.api and return it. */
export function installWindowApiStub(overrides: WindowApiStubOverrides = {}) {
  const api = makeWindowApiStub(overrides);
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as any).window.api = api;
  return api;
}
