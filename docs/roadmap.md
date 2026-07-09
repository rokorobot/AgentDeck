# AgentDeck Development Roadmap

This document tracks what has shipped, the current baseline, near-term candidates, and longer-term deferred ideas. Release-by-release detail (what exactly landed in each version) lives in [`PROJECT_STATE.md`](../PROJECT_STATE.md#release-log) — that table is the source of truth for shipped history; this document does not duplicate it.

---

## Shipped

- **v0.1 — Windows App Foundation**: Electron bootstrap, `xterm.js` terminal rendering, sandboxed browser preview, paste/input safety filters.
- **v0.2 — Probing & Observability**: folder auto-discovery, automated `.agentdeck/workspace.json` manifest generation, non-blocking HTTP/Ollama health checks, sidebar status badges.
- **v0.3 — Workspace Runtime Control**: process registry, Windows process-tree termination (`taskkill /F /T /PID`), self-healing terminal fallbacks, safety/runtime/process-event log tabs.
- **v0.4 — Service Orchestration**: `START ALL` / `STOP ALL` / `RESTART ALL` service groups, workspace service-level definitions (manifest schema v2 — see [`docs/workspace-manifest-spec.md`](workspace-manifest-spec.md) for the shipped spec, which superseded the earlier schema draft this document used to carry).
- **v0.5 — Workspace Templates & Manifest Editor**: onboarding wizard (Vite / Python / Static / Custom templates), visual manifest editor with schema validation, atomic writes with timestamped backups, read-only preset locking.
- **v0.6 — Packaging & Release Polish**: custom app icon, electron-builder NSIS installer pipeline, unsigned-installer documentation (see [`docs/release-notes-v0.6.md`](release-notes-v0.6.md)).
- **v1.0.0–v1.0.5 — Governance & Evidence**: Governance Center (policies, release-candidate lifecycle), Evaluations Center (benchmarks, regression runs, gold standards, judges, promotions), Timeline & Replay, and Decision Evidence Packages (DEP) with chain-of-custody tracking.
- **v1.0.6 — Agent Workspace Foundation**: directory-grounded workspaces, Workspace Agents dashboard, multi-agent model binding, agent metadata persisted in `.agentdeck/workspace.json`.
- **v1.0.7 — Agent Topology Wizard**: scans a project's structure and suggests agent roles automatically.
- **v1.0.8 — Audit Remediation & Platform Upgrade**: Vitest test harness + CI gate, hardened `ide:open` command execution, honest integrity-checksum wording (replacing overstated "cryptographic seal/signature" claims), workspace-path and filename-ID validation at the IPC boundary, hardened process termination, and the Electron 43 / Vite 8 / Vitest 4 / electron-builder 26 platform upgrade (`npm audit` 0).

---

## Current Baseline: v1.0.8

The current shipped state (untagged v1.0.9 hardening arc on top; `main` @ `923849f`). See [`PROJECT_STATE.md`](../PROJECT_STATE.md) for the full session-reload artifact, and [`docs/audit-remediation-backlog.md`](audit-remediation-backlog.md) for the detailed audit trail behind the v1.0.8 hardening work.

---

## Next Candidates

Concrete, already-scoped follow-ups from the audit remediation backlog ([`docs/audit-remediation-backlog.md`](audit-remediation-backlog.md)), not yet scheduled:

- **Real integrity signing** — replace the unkeyed SHA-256 checksum with HMAC (per-install secret) or asymmetric signing, once the threat model is decided (accidental-corruption detection vs. tamper resistance vs. shared/team-manifest verification). Not started.
- ~~**God-file extraction (`electron/main.ts`)** — split `electron/main.ts`'s IPC handlers into per-domain modules.~~ **Done (v1.0.9 / W5), final merge `67b7848`.** All 12 scheduled IPC domains extracted into `electron/ipc/*Handlers.ts` — process → terminal → ide → system/misc → foundation split (`workspacePaths.ts` + `src/lib/integrityChecksum.ts`) → provenance → governance → timeline → evals → snapshots → doctor → dep — one behavior-preserving PR each. `src/lib/workspaceDoctor.ts` was intentionally NOT adopted (inline behavior preserved verbatim). **W5.1 final closure also done (PR #24, merge `a62c12f`):** the deferred `workspace:*` handlers and `safety:approve` extracted into `electron/ipc/workspaceHandlers.ts` + `electron/ipc/safetyHandlers.ts` — `main.ts` now **187 lines** (from ~1,046 pre-W5 → 407 post-W5 → 187), purely lifecycle/composition with zero inline IPC handlers; test suite at 351/351. **W6 — Renderer Store/UI Slicing:** design gate completed (read-only), the renderer test harness landed (W6-0, PR #26 — jsdom Vitest project + `window.api` stub + store characterization + EvaluationsView smoke), and `EvaluationsView` tab extraction (W6-1) is **now complete** — see the dedicated candidate below. `workspaceStore.ts` domain slicing (W6-3) has passed its design gate (fixed decision: single Zustand store, slice pattern, one shared `(set, get)` closure — **not** multiple stores), **W6-3 p0 plumbing is merged** (PR #39, merge `592961d`), and **W6-3 p1 DoctorSlice is merged** (PR #41, merge `923849f`) — see the dedicated candidate below.
- ~~**`EvaluationsView` decomposition**~~ — **Done (v1.0.9 / W6-1).** Broke the largest component (1,383 lines, 7 sub-features) into per-tab components, one tab per behavior-preserving PR into `src/components/evaluations/`: `BenchmarksTab` ✅ (PR #27), `RegressionTab` ✅ (PR #28), `ApprovalsTab` ✅ (PR #29, merge `1ae3455`), `FailuresTab` ✅ (PR #31, merge `39f71de`), `PromotionHistoryTab` ✅ (PR #33, merge `bebe29a`), `GoldStandardsTab` ✅ (PR #35, merge `2dc5fc2`), `JudgesDefinitionsTab` ✅ (PR #37, merge `9bc2f13`) — the final, heaviest tab (dual-pane, two forms). Guarded by the W6-0 renderer harness (jsdom Vitest project). Optional shared `<Tabs>`/`<Modal>` primitive (W6-2) only if duplication proves real — not started. `EvaluationsView.tsx` line-count trail: 1,383 → 1,330 → 1,125 → 1,064 → 877 → 833 → 692 → **418 lines**. `EvaluationsView` is now a thin router with zero inline tab JSX; all 7 tabs live in `src/components/evaluations/`. **Next:** see `workspaceStore.ts` slicing (W6-3) below.
- **`workspaceStore.ts` domain slicing (W6-3)** — design gate complete; **fixed decision:** single Zustand store composed from domain *slices* (one shared `(set, get)` closure), **not** multiple stores, to preserve the ~243 cross-domain `get()` reads + side-effect chains. **W6-3 p0 done** (PR #39, merge `592961d`): near-zero-risk plumbing only — the ambient `window.api` type block moved out of `src/store/workspaceStore.ts` into new `src/types/windowApi.d.ts`, and type-only `src/store/slices/types.ts` added (`WorkspaceSliceCreator` helper). `workspaceStore.ts` **2,449 → 2,339 lines**; **no** domain behavior/state/actions moved, no store API change, no components/`electron/**`/`electron/preload.ts`/`package.json`/`package-lock.json` changes; tests unchanged at 396/396 (no tests added — pure plumbing). **W6-3 p1 done** (PR #41, merge `923849f`): first domain slice extracted, proving the pattern — Doctor *characterization* tests were added and passed **against the inline code first**, then `doctorReport` state plus `runDoctorChecks`/`repairWorkspaceCheck`/`exportDiagnosticBundle` (all 3 `window.api.doctor.*` IPC calls) moved verbatim into new `src/store/slices/doctorSlice.ts` (74 lines), spread into the store via `...createDoctorSlice(set, get, store)`. The same characterization tests passed **unchanged** after extraction. `workspaceStore.ts` **2,339 → 2,294 lines**; `loadEvalsData()` stays in `workspaceStore.ts` and still triggers Doctor refresh via `get().runDoctorChecks()`; `useWorkspaceStore` hook identity unchanged (store creator gained a third `store` param only to satisfy the `StateCreator` signature); no components/`electron/**`/`electron/preload.ts`/`package.json`/`package-lock.json` changes. Tests at 401/401 (node 351/351 + renderer 50/50). `slices/` holds `types.ts` + `doctorSlice.ts` only. **Next — W6-3 p2 (ProvenanceSlice candidate):** `provenanceList` + `loadProvenance`/`recordProvenance`, with the `activeWorkspace`-only outbound coupling identified at the design gate. Add Provenance *characterization* tests **FIRST**, and **only after** they pass green begin `ProvenanceSlice` extraction, following the same doctorSlice pattern. Not started.
- **Error-surfacing polish** — route caught errors to the UI (toast/log) instead of `console.error`-only; retire `alert()`/`window.prompt()`. Not started.
- ~~**Safety-gate de-noise** — unify the two `commandSafety` implementations and reduce false positives (e.g. `npm rm <pkg>` currently gets flagged).~~ **Done (v1.0.9 / W2):** shared `src/lib/commandPolicy.ts`; see `tests/commandPolicy.test.ts` and `tests/commandSafetyBackend.test.ts`.
- ~~**`scratch/` cleanup** — fold the ad-hoc simulation scripts into the real test suite or retire them.~~ **Done (v1.0.9 / W3):** see `tests/depRiskEngine.test.ts` and `tests/workspaceDoctor.test.ts`.
- ~~**Collision-safe IDs** — `Date.now()`-based IDs could collide within the same millisecond.~~ **Done (v1.0.9 / W1):** all 24 true ID-generator sites now use `crypto.randomUUID()`; see `tests/idGeneration.test.ts`.
- ~~**Shared JSON I/O helper** — collapse ~30 duplicated read/parse/write sites in `main.ts` into one tested utility.~~ **Helper done (v1.0.9 / W4)**, `src/lib/jsonIo.ts`; adoption into `main.ts` happens per-domain as the god-file extraction above proceeds.

---

## Deferred / Future

Longer-term ideas, not yet scoped into concrete tasks:

- Local LLM execution context logs and monitored agent execution streams (spawning shell sub-agents to debug terminal errors).
- Ollama model management HUD (direct model download/selection from the sidebar).
- Context-aware shell command suggestions.
- Plugin extension registry.
- Shared/team workspace manifest configurations.
- Remote VPS runtime dashboard (controlling remote services from the local HUD).

Note: if shared/team manifest distribution becomes real, the trust-boundary hardening in v1.0.8 (path validation, command execution) becomes materially more important — a malicious shared manifest would turn a local footgun into a remote one. Re-prioritize the "Next Candidates" security items above that milestone if it's picked up.
