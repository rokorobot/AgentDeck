# AgentDeck — PROJECT STATE

> Session-reload artifact. Load this (plus `docs/roadmap.md`)
> into a fresh AI session to continue work with full project context.
> Regenerate at every milestone release.

**Snapshot:** 2026-06-23 · current version **v1.0.6** (Agent Workspace Foundation) · branch `main`
**Repo:** https://github.com/rokorobot/AgentDeck.git

## What AgentDeck is

AgentDeck is a local developer ergonomics workbench and Workspace OS for building, debugging, and governing AI agents. It transitions local folders into grounded, observable execution contexts. Rather than acting as a simple preset launcher, AgentDeck links terminal processes, file systems, local port presets, and LLM model bindings directly to directories. It is built as a native desktop application using Electron (main/preload runtime) and a Vite-powered React front-end interface, complete with a fallback browser mode.

## The value chain (all segments working end-to-end)

```
Workspace Directory (Grounding Boundary)  Any folder on disk (C:\Users\Robert\AgentDeck_TestWorkspace)
  ↓ Open Folder / Discovery
.agentdeck/workspace.json                 Local workspace configuration, persists agent metadata & services
  ↓ Parse / Load
Zustand Store (workspaceStore.ts)         In-memory workspace, agent sessions, and layout state
  ↓ Start Agent Session
Live TTY Terminal (PowerShell/WSL)        Terminal child process spawned, directory-grounded via cwd
  ↓ Telemetry & Telemetry Poll
Observability & Health Checks             Port telemetry, Ollama model check, log listeners
```

## Release Log

| Version | Focus / Key Deliverables |
|---|---|
| **v0.1** | Native Electron app foundation, `xterm.js` rendering standard Windows shells, sandboxed browser preview. |
| **v0.2** | Context auto-discovery, directory picker, automated manifest generation (`.agentdeck/workspace.json`), health checks. |
| **v0.3** | Process control, service registry, process-tree recursive force-killing (`taskkill`), self-healing terminals. |
| **v1.0.5** | Decision Evidence Package (DEP), compliance rationales, deterministic risk engine scoring, local archive export. |
| **v1.0.5a** | DEP Chain of Custody timeline, audit-ready timestamps/actor logging, live export registration. |
| **v1.0.6** | **Agent Workspace Foundation**: transitions from presets to directory-grounded workspaces. Adds Workspace Agents dashboard, multi-agent model binding (GPT/Claude), persistence in `.agentdeck/workspace.json`, and terminal grounding. |

## How to run

- **Developer environment**:
  ```powershell
  cd C:\Users\Robert\AgentDeck
  npm run dev
  ```
- **Vite compilation check**:
  ```powershell
  npm run build:vite
  ```
- **TypeScript main compile**:
  ```powershell
  tsc --project tsconfig.electron.json
  ```
- **Automated state test**:
  ```powershell
  npx tsx C:\Users\Robert\.gemini\antigravity\brain\9997e5cf-3509-43bd-948f-8f3d39df347c\test_agent_workspace_foundation.ts
  ```

## Next Milestones

1. **Electron Native Grounding (v1.0.7)**: Hardening native TTY terminal spawning, managing child process lifecycles, and ensuring `cwd` grounding robustly behaves across multiple platforms.
2. **Local Agent Executor Integration**: Connecting local agent reasoning loops with the spawned grounded terminals and safety check approval queue pipelines.
