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
      scanAgentTopology: async (rootPath: string) => {
        const workspaceId = rootPath.split(/[\\/]/).pop() || 'unknown';
        const detectedFrom: string[] = ['React frontend', 'Vite project', 'TypeScript'];
        const suggestedAgents: any[] = [
          {
            id: 'react_ui_agent',
            name: 'React UI Agent',
            role: 'Maintains React interface, dashboard components, modal flows, state wiring, and user-facing workspace screens.',
            reason: 'Detected React frontend files, Vite config, or react dependency.',
            tools: ['terminal', 'browser', 'files'],
            modelBinding: { provider: 'anthropic', model: 'claude-sonnet' }
          }
        ];

        if (workspaceId === 'tm4' || rootPath.includes('AgentDeck_TestWorkspace')) {
          detectedFrom.push('Backend code', 'Test scripts', 'Documentation folder');
          suggestedAgents.push(
            {
              id: 'backend_agent',
              name: 'Backend Agent',
              role: 'Maintains API routes, backend services, persistence, validation, and server-side architecture.',
              reason: 'Detected backend directory, Python files, FastAPI reference, or dependency configuration.',
              tools: ['terminal', 'files', 'logs'],
              modelBinding: { provider: 'openai', model: 'gpt-5.5' }
            },
            {
              id: 'testing_agent',
              name: 'Testing Agent',
              role: 'Reviews test coverage, proposes verification scenarios, tracks acceptance criteria, and validates release boundaries.',
              reason: 'Detected test folder, test spec files, or test scripts configured in package.json.',
              tools: ['terminal', 'files', 'git'],
              modelBinding: { provider: 'openai', model: 'gpt-5.5' }
            },
            {
              id: 'documentation_agent',
              name: 'Documentation Agent',
              role: 'Maintains project state, release notes, architecture docs, and decision records.',
              reason: 'Detected project documentation folder or design markdown files.',
              tools: ['files'],
              modelBinding: { provider: 'openai', model: 'gpt-5.5' }
            }
          );
        }

        if (workspaceId === 'sound-machina') {
          detectedFrom.push('Backend code');
          suggestedAgents.push({
            id: 'backend_agent',
            name: 'Backend Agent',
            role: 'Maintains API routes, backend services, persistence, validation, and server-side architecture.',
            reason: 'Detected backend directory, Python files, FastAPI reference, or dependency configuration.',
            tools: ['terminal', 'files', 'logs'],
            modelBinding: { provider: 'openai', model: 'gpt-5.5' }
          });
        }

        return {
          id: `suggest_${Date.now()}`,
          workspaceId,
          detectedFrom,
          confidence: suggestedAgents.length >= 3 ? 'high' : 'medium',
          suggestedAgents,
          createdAt: new Date().toISOString()
        };
      }
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
