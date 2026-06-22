import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Browser-safe fallback mock for window.api when running outside of Electron
if (typeof window !== 'undefined' && !((window as any).api)) {
  console.warn('[AgentDeck] Electron API not detected. Operating in web-browser fallback mode.');
  (window as any).api = {
    isMock: true,
    workspaces: {
      loadAll: async () => [
        {
          id: 'tm4',
          name: 'TM4 Studio',
          rootPath: 'C:\\Users\\Robert\\AgentDeck\\workspaces\\tm4',
          commands: [],
          services: [],
          quickActions: []
        },
        {
          id: 'sound-machina',
          name: 'Sound Machina',
          rootPath: 'C:\\Users\\Robert\\AgentDeck\\workspaces\\sound-machina',
          commands: [],
          services: [],
          quickActions: []
        },
        {
          id: 'robotstore',
          name: 'Robot Store',
          rootPath: 'C:\\Users\\Robert\\AgentDeck\\workspaces\\robotstore',
          commands: [],
          services: [],
          quickActions: []
        }
      ],
      load: async () => null,
      openDirectory: async () => null,
      loadFromPath: async () => null,
      checkConfig: async () => ({ exists: false }),
      initialize: async () => ({ success: false, error: 'Not available in browser mode.' }),
      save: async (_id: string, _rootPath: string, config: any) => ({ success: true, workspace: config }),
    },
    layout: {
      save: async () => true,
      load: async () => ({}),
    },
    logs: {
      save: async () => true,
      load: async () => [],
      add: async (log: any) => log,
      onLogsChanged: () => () => {},
    },
    ollama: {
      checkStatus: async () => ({ running: false, models: [] }),
    },
    ports: {
      checkHealth: async () => ({ online: false }),
    },
    process: {
      start: async () => { throw new Error('Process execution not available in browser mode.'); },
      stop: async () => false,
      restart: async () => null,
      list: async () => [],
      onStateChanged: () => () => {},
    },
    ide: {
      open: async () => ({ success: false, error: 'IDE integration not available in browser mode.' }),
    },
    terminal: {
      create: async () => ({ id: 'mock-term', type: 'mock' }),
      write: () => {},
      resize: () => {},
      kill: async () => true,
      onData: () => () => {},
      onExit: () => () => {},
      onFallbackRecreated: () => () => {},
    },
    safety: {
      approveCommand: async () => false,
    },
    evals: {
      loadData: async () => ({ benchmarks: [], runs: [], failures: [], goldStandards: [], judges: [], promotions: [] }),
      saveBenchmarks: async () => true,
      saveFailure: async () => true,
      deleteFailure: async () => true,
      saveRegressionHistory: async () => true,
      saveGoldStandard: async () => true,
      deleteGoldStandard: async () => true,
      saveJudges: async () => true,
      savePromotions: async () => true,
    },
    timeline: {
      loadEvents: async () => [],
      saveEvent: async () => true,
    },
    governance: {
      loadData: async () => ({ policies: null, candidates: [] }),
      savePolicies: async () => true,
      saveCandidates: async () => true,
    },
    snapshots: {
      loadAll: async () => [],
      create: async () => ({ id: 'mock-snapshot', timestamp: new Date().toISOString() }),
      restore: async () => ({ success: false }),
      loadPayload: async () => ({})
    },
    provenance: {
      loadAll: async () => [],
      recordMutation: async () => ({}),
      seal: async () => ({})
    },
    doctor: {
      runChecks: async () => ({ status: 'healthy', checks: [] }),
      repair: async () => ({ success: false }),
      exportDiagnosticBundle: async () => ({ success: false })
    },
    dep: {
      generate: async () => ({}),
      signAndSave: async () => ({}),
      loadAll: async () => [],
      verify: async () => ({ verified: false }),
      exportJson: async () => ({ success: false }),
      exportMarkdown: async () => ({ success: false })
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
