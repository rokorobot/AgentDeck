# AgentDeck — PROJECT STATE

> Session-reload artifact. Load this (plus `docs/roadmap.md`)
> into a fresh AI session to continue work with full project context.
> Regenerate at every milestone release.

**Snapshot:** 2026-07-08 · current version **v1.0.8** (Audit Remediation & Platform Upgrade) · branch `main` @ `f1e7c37`
**Repo:** https://github.com/rokorobot/AgentDeck.git

Since the v1.0.8 tag, an internal-hardening arc (v1.0.9, untagged/in progress) has landed on top of it without a version bump: collision-safe IDs (W1), command-safety unification (W2), `scratch/` retirement into real tests (W3), a shared JSON I/O helper (W4), and an in-progress `electron/main.ts` decomposition (W5, one domain per PR). See "Next Milestones" below for exact status and [`docs/roadmap.md`](docs/roadmap.md) for the full forward-looking list.

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
| **v1.0.7** | **Agent Topology Wizard**: automated workspace scanning to suggest agent roles from detected project structure. |
| **v1.0.8** | **Audit Remediation & Platform Upgrade**: test harness + CI gate, `ide:open` shell-injection fix, honest integrity-checksum wording, workspace path/filename-ID validation at the IPC boundary, `taskkill` command hardening, and the Electron 43 / Vite 8 / Vitest 4 / electron-builder 26 platform upgrade (`npm audit` 0). |

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
- **Automated tests** (177 tests on `main`; 183 once open PR #11 merges; `npm audit` at 0):
  ```powershell
  npm test
  npm run build
  npm audit
  ```

## Next Milestones

- **Electron native TTY grounding has shipped**: the Electron 43 + node-pty 1.1.0 platform upgrade (v1.0.8, see Release Log above) hardened native terminal spawning and verified `cwd` grounding under the new runtime.

### In-progress work (v1.0.9, untagged): `electron/main.ts` decomposition (W5)

`main.ts` (~3,400 lines, ~55 IPC handlers) is being split one domain per PR, behind a `registerXxx(deps)` pattern with a lazy `getMainWindow()` getter, ratified in PR 1:

| PR | Domain | Status |
|---|---|---|
| 1 | `process` | ✅ merged (`f1e7c37`) |
| 2 | `terminal` | open — [PR #11](https://github.com/rokorobot/AgentDeck/pull/11), CI green, awaiting merge approval |
| 3 | `ide` | not started |
| 4 | `system`/misc | not started |
| 5 | foundation split (`workspacePaths.ts`, `src/lib/integrityChecksum.ts`) | not started |
| 6–9 | `provenance` → `governance` → `timeline` → `evals` | not started |
| 10 | `snapshots` | not started |
| 11 | `doctor` (adopts `src/lib/workspaceDoctor.ts`, needs a fidelity/behavior-diff gate — that module covers 7 of main.ts's 8 current checks) | not started |
| 12 | `dep` (adopts `src/lib/depRiskEngine.ts`, same fidelity gate, most coupled — last) | not started |

**To resume:** merge PR #11 if not already done, then start PR 3 (`ide`) on a fresh branch (`refactor/extract-ide-ipc`) following the exact PR 1/PR 2 pattern — verbatim relocation, wiring test, headless boot check, honest manual-smoke framing. Full design-gate rationale (dependency graph, sequencing, per-domain gates) was approved before implementation began; ask for it if a fresh session needs the reasoning, not just the checklist above.

### Already-closed items from the audit backlog

Collision-safe IDs (W1), command-safety unification + de-noise (W2), `scratch/` retirement into real tests (W3), and the `readJsonSafe`/`writeJsonAtomic` helper (W4, not yet adopted — that's what W5 is for) are all merged to `main`. See [`docs/audit-remediation-backlog.md`](docs/audit-remediation-backlog.md) for the full, currently-accurate status of every tracked item, and [`docs/roadmap.md`](docs/roadmap.md) for the single source of truth on forward-looking work — kept there so this file doesn't drift out of sync with it.
