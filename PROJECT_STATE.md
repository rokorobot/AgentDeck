# AgentDeck — PROJECT STATE

> Session-reload artifact. Load this (plus `docs/roadmap.md`)
> into a fresh AI session to continue work with full project context.
> Regenerate at every milestone release.

**Snapshot:** 2026-07-09 · current version **v1.0.8** (Audit Remediation & Platform Upgrade) · branch `main` @ `923849f`
**Repo:** https://github.com/rokorobot/AgentDeck.git

Since the v1.0.8 tag, an internal-hardening arc (v1.0.9, untagged) has landed on top of it without a version bump: collision-safe IDs (W1), command-safety unification (W2), `scratch/` retirement into real tests (W3), a shared JSON I/O helper (W4), the **now-complete** `electron/main.ts` decomposition (W5, one IPC domain per PR — 12 PRs, all merged; plus W5.1 final closure, PR #24), the **now-complete** renderer `EvaluationsView` tab extraction (W6-1, 7 PRs, all merged), the **now-merged** W6-3 p0 store-slicing plumbing (PR #39 — pure type/scaffolding relocation, no domain behavior moved), and the **now-merged** W6-3 p1 DoctorSlice extraction (PR #41 — first domain slice, characterization-tests-first). See "Next Milestones" below for the completed W5/W5.1/W6-1 record, the merged W6-3 p0 plumbing, the merged W6-3 p1 DoctorSlice, and the W6-3 p2 ProvenanceSlice next step, and [`docs/roadmap.md`](docs/roadmap.md) for the full forward-looking list.

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
- **Automated tests** (401 tests on `main` — a `node` project of 351 + a `renderer` jsdom project of 50; `npm audit` at 0):
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

### ✅ COMPLETE: W6-1 — `EvaluationsView` Tab Extraction (renderer decomposition)

Renderer subsystem decomposition, gated by a design pass (read-only inventory: `src/store/workspaceStore.ts` ~2,449 lines / 122 members / 243 cross-domain `get()` calls; `src/components/EvaluationsView.tsx` 1,383 lines / 7 inline tabs). Key gate finding: **there was no renderer safety net** (all pre-W6 tests were `node`-env pure-lib / IPC-handler tests), so W6 started with tests before slicing. Same branch → PR → CI discipline; each PR is behavior-preserving with `git diff` proof that the store, `electron/**`, and package files are untouched.

The `EvaluationsView` decomposition arc (W6-1) is **done**. All 7 tabs were extracted into `src/components/evaluations/`, one behavior-preserving PR each, and `EvaluationsView.tsx` is now a thin router.

| PR | Scope | Status |
|---|---|---|
| **W6-0** | Renderer test harness: 2nd Vitest project (jsdom) alongside the untouched `node` project; `window.api` stub; store characterization tests + EvaluationsView smoke. **DevDependencies only** (`jsdom`, `@testing-library/react`, `@testing-library/jest-dom`). | ✅ merged (`7830bf5`, PR #26) |
| **W6-1 p1** | Extract `BenchmarksTab` → `src/components/evaluations/BenchmarksTab.tsx` | ✅ merged (`3c91ac1`, PR #27) |
| **W6-1 p2** | Extract `RegressionTab` | ✅ merged (`9574379`, PR #28) |
| **W6-1 p3** | Extract `ApprovalsTab` | ✅ merged (`1ae3455`, PR #29) |
| **W6-1 p4** | Extract `FailuresTab` | ✅ merged (`39f71de`, PR #31) |
| **W6-1 p5** | Extract `PromotionHistoryTab` | ✅ merged (`bebe29a`, PR #33) |
| **W6-1 p6** | Extract `GoldStandardsTab` | ✅ merged (`2dc5fc2`, PR #35) |
| **W6-1 p7** | Extract final `EvaluationsView` tab: `JudgesDefinitionsTab` (dual-pane, two forms) | ✅ merged (`9bc2f13`, PR #37) |
| **W6-2** | Shared `<Tabs>`/`<Modal>` primitive (only if duplication is real after the tab extractions) | not started |
| **W6-3 (sub-gate)** | Store-slicing design gate for `workspaceStore.ts`. **Fixed decision:** single Zustand store composed from domain *slices* — one shared `(set, get)` closure, **not** multiple stores — to preserve the 243 cross-domain `get()` reads + side-effect chains; slice leaf domains (doctor/dep/snapshots/provenance) before the highly-referenced core/evals/timeline. | ✅ gate complete — decision fixed |
| **W6-3 p0** | Near-zero-risk plumbing: moved the ambient `window.api` type block out of `src/store/workspaceStore.ts` into new `src/types/windowApi.d.ts`, and added type-only `src/store/slices/types.ts` (`WorkspaceSliceCreator` helper). **No** domain behavior, state, or actions moved; no store API change; no components/electron/preload/package changes. | ✅ merged (`592961d`, PR #39) |
| **W6-3 p1** | DoctorSlice proof-of-pattern — **characterization tests FIRST**, then extraction. First domain slice moved out of `workspaceStore.ts`. | ✅ merged (`923849f`, PR #41) |
| **W6-3 p2** | ProvenanceSlice candidate — `provenanceList` + `loadProvenance`/`recordProvenance`, `activeWorkspace`-only outbound coupling per the design gate. **Characterization tests FIRST** (see "To resume" below). | not started |

**Pattern for the tab extractions (W6-1):** each tab's JSX moved **verbatim** into a pure presentational component under `src/components/evaluations/`; the `EvaluationsView` shell keeps **all** state + store-hook usage and passes props + callbacks down. The only non-JSX edits allowed were build-forced (e.g. removing a now-unused lucide icon import). Every extracted tab has a focused renderer render test that pins a visible label + a callback. `EvaluationsView.tsx` line-count trail: 1,383 → 1,330 → 1,125 → 1,064 → 877 → 833 → 692 → **418 lines** (Benchmarks, Regression, Approvals, Failures, Promotion History, Gold Standards, and Judges & Definitions all out). All 7 tabs now extracted: `BenchmarksTab`, `RegressionTab`, `ApprovalsTab`, `FailuresTab`, `PromotionHistoryTab`, `GoldStandardsTab`, `JudgesDefinitionsTab` (`src/components/evaluations/JudgesDefinitionsTab.tsx`, 388 lines). Remaining inline tabs: **none** — the `EvaluationsView` decomposition is complete.

**W6-3 p0 — MERGED (PR #39, merge `592961d`).** Near-zero-risk store-slicing plumbing only. `src/store/workspaceStore.ts` went from **2,449 → 2,339 lines** by moving **only** the ambient `window.api` type block out to new **`src/types/windowApi.d.ts`** (a type-only module that `declare global`-augments `Window`, exactly as it did inline). New type-only scaffolding **`src/store/slices/types.ts`** exports the `WorkspaceSliceCreator<S, T>` helper — the shared slice-creator type future domain slices will conform to. **No domain behavior moved, no state/actions moved or renamed, no store API change**; `useWorkspaceStore = create<WorkspaceStore>((set, get) => …)` hook identity is unchanged; **no** components / `electron/**` / `electron/preload.ts` / `package.json` / `package-lock.json` changes. Tests unchanged at **396/396** (node 351/351 + renderer 45/45) — this PR added **no** tests (pure plumbing). The `slices/` directory contains **only** `types.ts` — no domain slice files (e.g. `doctorSlice.ts`) exist yet. The Doctor actions (`runDoctorChecks`, `repairWorkspaceCheck`, `exportDiagnosticBundle`) remain defined **inline** in `workspaceStore.ts`.

**W6-3 p1 — MERGED (PR #41, merge `923849f`).** First domain slice extracted from `workspaceStore.ts`, proving the slice pattern end-to-end. **Characterization-first proof:** Doctor tests (`workspaceStore.characterization.test.tsx`) were added and passed **green against the inline (unmoved) code**, then the extraction happened, and the **same tests passed unchanged afterward** — no test edits were needed to make the extraction "pass." `src/store/workspaceStore.ts` went from **2,339 → 2,294 lines**; new **`src/store/slices/doctorSlice.ts`** (74 lines) holds `doctorReport` state plus the `runDoctorChecks`, `repairWorkspaceCheck`, and `exportDiagnosticBundle` actions, including all 3 `window.api.doctor.*` IPC calls (zero remain in `workspaceStore.ts`). `workspaceStore.ts` now spreads `...createDoctorSlice(set, get, store)` into the store creator. `loadEvalsData()` **still lives in `workspaceStore.ts`** and still triggers the Doctor refresh via `get().runDoctorChecks()` — the cross-domain coupling is preserved through the shared `(set, get)` closure, not re-wired. `useWorkspaceStore = create<WorkspaceStore>((set, get, store) => …)` hook identity is unchanged (the store creator gained a third `store` param only to satisfy the `StateCreator` call signature required to pass `store` through to `createDoctorSlice`); `WorkspaceStore extends DoctorSlice` was a type-only/additive change. **No** components / `electron/**` / `electron/preload.ts` / `package.json` / `package-lock.json` changes. Tests: **401/401** (node 351/351 + renderer 50/50) — 5 new characterization tests added ahead of the extraction. `slices/` now holds exactly `types.ts` + `doctorSlice.ts` — no further domain slices exist yet.

**Design decision (fixed at the W6-3 gate, still in force):** the store stays a **single Zustand store composed from domain slices** — one shared `(set, get)` closure — **not** multiple stores, so the ~243 cross-domain `get()` reads and side-effect chains are preserved. Slice leaf domains (doctor/dep/snapshots/provenance) before the highly-referenced core/evals/timeline.

**To resume — W6-3 p2: ProvenanceSlice candidate.** Required order:
1. **FIRST** add Provenance *characterization* tests that pin the current, unmoved behavior of `provenanceList` state and the `loadProvenance` / `recordProvenance` actions in `workspaceStore.ts`, including the `activeWorkspace`-only outbound coupling identified at the design gate (Provenance should only read/depend on `activeWorkspace`, not other cross-domain state).
2. **ONLY AFTER** those characterization tests are green should `ProvenanceSlice` extraction begin, following the same pattern as `doctorSlice.ts`: state + actions move verbatim into `src/store/slices/provenanceSlice.ts`, `workspaceStore.ts` spreads `...createProvenanceSlice(set, get, store)`, and any cross-domain callers (e.g. via `get()`) are left calling the same action names unchanged.
3. Not started. Do not move any Provenance state/actions before the characterization tests pass.

### Already-closed items from the audit backlog

Collision-safe IDs (W1), command-safety unification + de-noise (W2), `scratch/` retirement into real tests (W3), and the `readJsonSafe`/`writeJsonAtomic` helper (W4, not yet adopted — that's what W5 is for) are all merged to `main`. See [`docs/audit-remediation-backlog.md`](docs/audit-remediation-backlog.md) for the full, currently-accurate status of every tracked item, and [`docs/roadmap.md`](docs/roadmap.md) for the single source of truth on forward-looking work — kept there so this file doesn't drift out of sync with it.
