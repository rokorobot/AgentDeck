# AgentDeck — PROJECT STATE

> Session-reload artifact. Load this (plus `docs/roadmap.md`)
> into a fresh AI session to continue work with full project context.
> Regenerate at every milestone release.

**Snapshot:** 2026-07-09 · current version **v1.0.8** (Audit Remediation & Platform Upgrade) · branch `main` @ `a62c12f`
**Repo:** https://github.com/rokorobot/AgentDeck.git

Since the v1.0.8 tag, an internal-hardening arc (v1.0.9, untagged) has landed on top of it without a version bump: collision-safe IDs (W1), command-safety unification (W2), `scratch/` retirement into real tests (W3), a shared JSON I/O helper (W4), and the **now-complete** `electron/main.ts` decomposition (W5, one IPC domain per PR — 12 PRs, all merged; plus W5.1 final closure, PR #24). See "Next Milestones" below for the completed W5/W5.1 record and [`docs/roadmap.md`](docs/roadmap.md) for the full forward-looking list.

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
- **Automated tests** (351 tests on `main`; `npm audit` at 0):
  ```powershell
  npm test
  npm run build
  npm audit
  ```

## Next Milestones

- **Electron native TTY grounding has shipped**: the Electron 43 + node-pty 1.1.0 platform upgrade (v1.0.8, see Release Log above) hardened native terminal spawning and verified `cwd` grounding under the new runtime.

### ✅ COMPLETE (v1.0.9, untagged): `electron/main.ts` decomposition (W5)

The god-file extraction arc is **done**. All 12 scheduled IPC domains were split out of `electron/main.ts` into `electron/ipc/*Handlers.ts`, one domain per PR, behind a `registerXxx(deps)` pattern (deps injected; `getMainWindow()` passed lazily where the window is read). Every PR was a behavior-preserving relocation with build + test + `npm audit` + headless-boot gates and CI-green, branch → PR → merge discipline. **Final merge commit: `67b7848` (PR #22).**

`electron/main.ts` went from **~1,046 lines → 407** and is now essentially composition/wiring.

| PR | Domain | Module |
|---|---|---|
| 1 | `process` | `electron/ipc/processHandlers.ts` |
| 2 | `terminal` | `electron/ipc/terminalHandlers.ts` |
| 3 | `ide` | `electron/ipc/ideHandlers.ts` |
| 4 | `system`/misc | `electron/ipc/systemHandlers.ts` |
| 5 | **foundation split** | `electron/workspacePaths.ts` + `src/lib/integrityChecksum.ts` |
| 6 | `provenance` | `electron/ipc/provenanceHandlers.ts` |
| 7 | `governance` | `electron/ipc/governanceHandlers.ts` |
| 8 | `timeline` | `electron/ipc/timelineHandlers.ts` |
| 9 | `evals` | `electron/ipc/evalsHandlers.ts` |
| 10 | `snapshots` | `electron/ipc/snapshotsHandlers.ts` |
| 11 | `doctor` | `electron/ipc/doctorHandlers.ts` |
| 12 | `dep` | `electron/ipc/depHandlers.ts` |

Cross-domain wiring preserved: `doctorHandlers.ts` returns `runDoctorChecksInternal` + `recordRemediationProvenance`, which `main.ts` passes into `registerDepHandlers` (DEP consumes both). Foundation resolvers (`getEvalsDir`/`getTimelineDir`/`getGovernanceDir`/`getSnapshotsDir`/`getDecisionsDir`/`getProvenancePath`) are bound once to `DATA_DIR` via `createWorkspacePaths(DATA_DIR)` and injected; `computeHash`/`verifyHash` are the canonical helpers in `src/lib/integrityChecksum.ts`. **`src/lib/workspaceDoctor.ts` was NOT adopted** — W5 preserved the inline doctor behavior verbatim; any parity merge is a separate, gated effort. Verification: 333/333 tests, build clean, `npm audit` 0, CI green on `67b7848`, `audit-remediation-safety-net` tag untouched at `5005cf0`.

### ✅ COMPLETE: W5.1 — Main Process Final Closure

The two W5-deferred inline domains were extracted in one follow-up PR (**PR #24, merge `a62c12f`**), making `electron/main.ts` purely lifecycle + composition/wiring:

| Module | Channels |
|---|---|
| `electron/ipc/safetyHandlers.ts` | `safety:approve` |
| `electron/ipc/workspaceHandlers.ts` | `workspace:load-path` / `check-config` / `initialize` / `save` / `scanAgentTopology` |

`electron/main.ts` is now **187 lines** (from ~1,046 pre-W5 → 407 post-W5 → 187): `createWindow`, app lifecycle, dir bootstrap, the `createWorkspacePaths(DATA_DIR)` binding, and 14 ordered `register*Handlers(...)` calls — **zero inline IPC handlers remain**. Behavior-preserving relocation only (template wizard, manifest validation, timestamped-backup + atomic write, topology scan all verbatim; sole mechanical edit `WORKSPACES_DIR` → injected `workspacesDir`). Verification: **351/351 tests**, build clean, `npm audit` 0, CI green on `a62c12f`.

**Next milestone: W6 Design Gate — Store/UI Slicing** (renderer subsystem: `workspaceStore.ts` domain slices, `EvaluationsView` decomposition, state boundaries). This is a different subsystem with a different risk profile than W5 and needs its own design gate + frontend-state inventory before any code moves. Not started.

### Already-closed items from the audit backlog

Collision-safe IDs (W1), command-safety unification + de-noise (W2), `scratch/` retirement into real tests (W3), and the `readJsonSafe`/`writeJsonAtomic` helper (W4, not yet adopted — that's what W5 is for) are all merged to `main`. See [`docs/audit-remediation-backlog.md`](docs/audit-remediation-backlog.md) for the full, currently-accurate status of every tracked item, and [`docs/roadmap.md`](docs/roadmap.md) for the single source of truth on forward-looking work — kept there so this file doesn't drift out of sync with it.
