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

The current shipped state. See [`PROJECT_STATE.md`](../PROJECT_STATE.md) for the full session-reload artifact, and [`docs/audit-remediation-backlog.md`](audit-remediation-backlog.md) for the detailed audit trail behind the v1.0.8 hardening work.

---

## Next Candidates

Concrete, already-scoped follow-ups from the audit remediation backlog ([`docs/audit-remediation-backlog.md`](audit-remediation-backlog.md)), not yet scheduled:

- **Real integrity signing** — replace the unkeyed SHA-256 checksum with HMAC (per-install secret) or asymmetric signing, once the threat model is decided (accidental-corruption detection vs. tamper resistance vs. shared/team-manifest verification). Not started.
- ~~**God-file extraction (`electron/main.ts`)** — split `electron/main.ts`'s IPC handlers into per-domain modules.~~ **Done (v1.0.9 / W5), final merge `67b7848`.** All 12 scheduled IPC domains extracted into `electron/ipc/*Handlers.ts` — process → terminal → ide → system/misc → foundation split (`workspacePaths.ts` + `src/lib/integrityChecksum.ts`) → provenance → governance → timeline → evals → snapshots → doctor → dep — one behavior-preserving PR each. `src/lib/workspaceDoctor.ts` was intentionally NOT adopted (inline behavior preserved verbatim). **W5.1 final closure also done (PR #24, merge `a62c12f`):** the deferred `workspace:*` handlers and `safety:approve` extracted into `electron/ipc/workspaceHandlers.ts` + `electron/ipc/safetyHandlers.ts` — `main.ts` now **187 lines** (from ~1,046 pre-W5 → 407 post-W5 → 187), purely lifecycle/composition with zero inline IPC handlers; test suite at 351/351. **Next: W6 Design Gate — Store/UI Slicing** (`workspaceStore.ts` domain slices + `EvaluationsView` decomposition) — a renderer-subsystem milestone needing its own design gate; not started.
- **`EvaluationsView` decomposition** — break the largest component (1,300+ lines, 7 sub-features) into per-tab components with a shared `<Tabs>`/`<Modal>`. Not started.
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
