# AgentDeck — Audit Remediation Backlog

> Operational remediation plan derived from the v1.0.7 engineering audit.
> Source of truth: the AgentDeck principal-level audit (2026-07-07).
> Each row is issue-ready: an ID, the affected module, the finding, severity, the fix, and a verifiable acceptance criterion.

**Scope:** AgentDeck desktop app (Electron 30 + React 18 + Zustand + Vite).
**Snapshot:** repo tagged `v1.0.7`, branch `main`.
**Legend — Severity:** Critical · High · Medium · Low.
**Legend — Change risk:** Low / Med / High (risk that the fix itself breaks something).

---

## 1. Quick Wins (do first — small effort, removes the most dangerous claims)

| ID | Area | Finding | Severity | Fix | Acceptance |
|----|------|---------|----------|-----|-----------|
| QW1 | Terminal / IDE Open | Shell injection via `ide:open` — renderer `folderPath` interpolated into `exec()` string (`electron/main.ts:476-503`, exec at `:493`) | High | Replace shell string with `execFile`/`spawn` + arg array; map `ide → {file,args}` | Injection test (`folderPath` with `&`, `$()`, backtick) does not execute; normal IDE/folder launch still works |
| QW2 | Governance Integrity | False "cryptographic seal/signature" claim — unkeyed SHA-256 stored beside data (`electron/main.ts:940-970`); frontend only reads a flag (`src/lib/governanceIntegrity.ts`) | High | Rename to "integrity checksum" across UI/exports **or** implement HMAC; make `governanceIntegrity.ts` recompute, not trust a flag | Forged record fails verification (HMAC path) **or** no UI/doc string claims "signature/tamper-proof/seal" (rename path) |
| QW3 | Docs / Release Identity | Version + license drift: `package.json:3`=0.1.0, tag=v1.0.7, `README.md:5`=v0.6, `PROJECT_STATE.md:7`=v1.0.6; README claims MIT but no LICENSE file | Medium | Reconcile version across manifest/docs/tag; add `LICENSE` (MIT) | One version string everywhere; `LICENSE` present at repo root |
| QW4 | Testing | No test runner — `package.json` has no `test` script; `tests/topology.test.ts` is a hand-rolled `assert()`; CI runs only `npm run build` | Critical | Add Vitest + `"test": "vitest run"`; add a test step to CI | `npm test` runs and passes in CI on every PR |

---

## 2. Milestones

### M0 — Safety net (must precede any refactor)

| ID | Area | Finding | Severity | Fix / Acceptance | Effort | Risk | Deps |
|----|------|---------|----------|------------------|--------|------|------|
| M0.1 | Testing | Core logic untested: `commandSafety`, `manifestValidation`, `governanceIntegrity`, store actions | Critical | Table-driven Vitest suites for the 3 libs. **Acceptance:** ≥80% line coverage on those files; suites run in CI | M | Low | QW4 |
| M0.2 | Testing | `tests/topology.test.ts` re-implements logic inline instead of importing it (`:56-63`) | Medium | Convert to `describe/it`, import real `scanAgentTopologyInternal`/`safeResolve`. **Acceptance:** no inlined duplicate of prod logic; test imports the module | S | Low | QW4 |
| M0.3 | DevEx / CI | CI only compiles — no lint, no test, no audit gate (`.github/workflows/build-test.yml`) | High | Add ESLint + Prettier configs; CI steps for lint, test, and `npm audit` (fail on high). **Acceptance:** CI fails on a lint error, a failing test, and a new high-severity advisory | M | Low | QW4 |

### M1 — Critical fixes (security & correctness)

| ID | Area | Finding | Severity | Fix / Acceptance | Effort | Risk | Deps |
|----|------|---------|----------|------------------|--------|------|------|
| M1.1 | Terminal / IDE Open | (Promote QW1 to hardened form) shell-string command construction | High | `execFile`/`spawn` map, no shell interpolation. **Acceptance:** injection test in CI passes; IDE + Explorer launch verified | S | Low | M0.1 |
| M1.2 | Governance Integrity | Integrity mechanism is forgeable (unkeyed hash) | High | Implement HMAC-SHA256 with an app-managed secret (Electron `safeStorage` / OS keychain, stored **outside** the workspace); migrate legacy records to "unsigned" rather than silently "verified". **Acceptance:** edited-then-rehashed record fails verification | L | Med | M0.1, QW2 |
| M1.3 | Manifest / Workspace | Renderer-supplied `folderPath`/`rootPath` used in fs ops without scoping (`electron/main.ts:261-376` and other handlers) | Medium | Validate every renderer path against an allowed root via `path.relative` before fs use (reuse `isPathSafe` logic). **Acceptance:** traversal path (`..\..\Windows`, foreign drive) is rejected at the IPC boundary | M | Med | M0.1 |
| M1.4 | Dependencies | 17 Electron advisories + vulnerable transitive deps (`tar`, `form-data`, `joi`, `js-yaml`, `esbuild`) | High | Upgrade Electron to a supported major; `npm audit fix`. **Acceptance:** app boots; `npm audit` reports 0 high | M | Med | M0.3 |
| M1.5 | Store / State | ~~`Date.now()` IDs collide within a millisecond (regression/failure/candidate IDs in `workspaceStore.ts`)~~ **DONE (v1.0.9 / W1)** | Medium | Replaced all 24 true ID-generator sites repo-wide with `crypto.randomUUID()` (no new dependency); timestamp/telemetry/file-naming `Date.now()` sites correctly left alone. **Acceptance met:** `tests/idGeneration.test.ts` proves zero collisions across 10k rapid calls. | S | Low | M0.1 |

### M2 — High-leverage (makes all later work easier)

| ID | Area | Finding | Severity | Fix / Acceptance | Effort | Risk | Deps |
|----|------|---------|----------|------------------|--------|------|------|
| M2.1 | Store / State + Doctor / DEP / Audit | **IN PROGRESS (v1.0.9 / W4-W5)**: `electron/main.ts` is a ~3,400-line god file holding all ~55 IPC handlers + business logic | High (maint.) | `readJsonSafe`/`writeJsonAtomic` helper shipped (W4, `src/lib/jsonIo.ts`, not yet adopted by any call site). Handler split underway one domain per PR (W5): PR1 `process` ✅ merged, PR2 `terminal` open (#11). Remaining sequence: ide → system/misc → foundation (`workspacePaths.ts`/`integrityChecksum.ts`) → provenance → governance → timeline → evals → snapshots → doctor (adopts `workspaceDoctor.ts`) → dep (adopts `depRiskEngine.ts`). **Acceptance:** behavior unchanged per domain (build+test+smoke gate each PR); `main.ts` < 400 lines when complete | L | Med | M0.1 |
| M2.2 | Store / State | `workspaceStore.ts` is a ~2,180-line god store (~37 fields, ~51 actions, 10+ domains) | Medium | Split into domain slices (workspace, terminals/process, evals, governance, snapshots, agents). **Acceptance:** views unchanged; each slice independently testable | L | Med | M0.1 |
| M2.3 | Evaluations | `EvaluationsView.tsx` is 1,383 lines / 29 `useState` / one render function | High | Split into 7 tab components; extract shared `<Tabs>` and `<Modal>` primitives. **Acceptance:** same behavior; each tab file < 300 lines; tab bar/modal come from one shared component | L | Med | — |
| M2.4 | Terminal / IDE Open | ~~Two divergent command-safety modules (`electron/commandSafety.ts` proper vs `src/lib/commandSafety.ts:35` crude `includes('..')`); pattern list false-positive prone (`\brm\b`, `\bssh\b`)~~ **DONE (v1.0.9 / W2)** | Medium | Unified behind shared pure `src/lib/commandPolicy.ts`; de-noised `rm` (package-manager alias only), `format` (drive-letter required), `ssh`/`scp` (command-position anchored) while keeping all destructive/exfiltration cases blocked. **Acceptance met:** first-ever direct tests on the backend `validateCommand`/`isPathSafe`/approval-TTL path. | M | Low | M0.1 |

### M3 — Quality & polish

| ID | Area | Finding | Severity | Fix / Acceptance | Effort | Risk | Deps |
|----|------|---------|----------|------------------|--------|------|------|
| M3.1 | Store / State | Errors caught but only `console.error`'d; `alert()`/`window.prompt()` used for the ones shown | Medium | Route caught errors through the system-log/toast path; retire `alert`/`prompt`. **Acceptance:** a forced IPC failure is visible in the UI, not just the console | M | Low | — |
| M3.2 | Docs / Release Identity | ~~`roadmap.md` two generations behind; `architecture.md` repeats the "cryptographic seal" claim~~ **DONE (M1.4d)** | Medium | `README.md`/`docs/roadmap.md` refreshed to v1.0.8; `docs/architecture.md` verified to contain no stale "cryptographic seal/signature" language. Real HMAC/asymmetric signing itself remains open (see M1.2, still blocked on the threat-model decision). | S | Low | M1.2 |
| M3.3 | Testing | ~~`scratch/*.ts` are ad-hoc simulations standing in for tests~~ **DONE (v1.0.9 / W3)** | Low | Folded worthwhile scenarios into `tests/depRiskEngine.test.ts` and `tests/workspaceDoctor.test.ts` (as characterization modules pending W5); `scratch/` removed. | M | Low | M0.1 |
| M3.4 | Doctor / DEP / Audit | Non-atomic snapshot restore / governance seal (TOCTOU, partial-write risk) | Medium | Write-to-temp + rename, or a restore lock. **Acceptance:** interrupted restore leaves the prior state intact | M | Med | M2.1 |
| M3.5 | Terminal / IDE Open | Safety gate is a UX speed-bump, not a boundary (shell-history recall bypasses `commandBuffer` check, `terminalManager.ts:127-140`) | Low | Document the gate's actual guarantee; don't market it as a security control. **Acceptance:** README/architecture state the gate is advisory | S | Low | — |

---

## 3. Module Mapping (findings grouped by workbench area)

### Terminal / IDE Open
- **QW1 / M1.1** — `ide:open` shell injection (`electron/main.ts:476-503`).
- ~~**M2.4** — Unify the two `commandSafety` modules; de-noise dangerous-pattern list.~~ **Done (v1.0.9 / W2).**
- **M3.5** — Safety gate is advisory (history-recall bypass); document it as such.
- *Preserve:* node-pty → spawn self-healing fallback (`electron/terminalManager.ts:78-91`); log cap at 200 (`electron/logger.ts:36-39`).

### Manifest / Workspace
- **M1.3** — Scope renderer-supplied paths against an allowed root before fs use.
- *Preserve:* atomic write + timestamped backup + read-only preset locking; dual UI/IPC manifest validation.

### Governance Integrity
- **QW2 / M1.2** — Unkeyed hash mislabeled as "cryptographic seal/signature" (`electron/main.ts:940-970`); frontend trusts a flag (`src/lib/governanceIntegrity.ts`). Rename or implement HMAC.
- *Preserve:* referential-integrity/cross-layer checks in `governanceIntegrity.ts`.

### Doctor / DEP / Audit
- **M2.1** — Extract doctor/DEP/provenance handlers out of the god file. **In progress (v1.0.9 / W5):** process ✅, terminal open (#11), doctor/dep still pending.
- **M3.4** — Make snapshot restore / governance seal atomic (TOCTOU).
- *Note:* DEP markdown export currently prints the checksum as "Cryptographic Seal" — covered by QW2's rename.

### Evaluations
- **M2.3** — Split `EvaluationsView.tsx` (1,383 lines / 29 `useState`) into 7 tab components + shared `<Tabs>`/`<Modal>`.
- ~~**M1.5** — Replace `Date.now()` IDs used by regression/failure/candidate records.~~ **Done (v1.0.9 / W1).**

### Store / State
- **M2.2** — Split `workspaceStore.ts` (~2,180 lines) into domain slices.
- ~~**M2.1** — Shared `readJsonSafe`/`writeJsonAtomic`~~ **helper done (v1.0.9 / W4)**; adoption into main.ts's ~30 boilerplate copies happens per-domain as W5 proceeds.
- ~~**M1.5** — Collision-safe IDs.~~ **Done (v1.0.9 / W1).**
- **M3.1** — Surface caught errors to the UI; retire `alert`/`prompt`.
- *Preserve:* immutable Zustand updates; clean per-domain `src/types/` modules.

### Docs / Release Identity
- **QW3** — One version string; add `LICENSE`.
- ~~**M3.2** — Refresh `roadmap.md`/`architecture.md` to match the tag and the real integrity mechanism.~~ **Done (M1.4d).**

### Testing / CI (cross-cutting)
- **QW4 / M0.1 / M0.2** — Vitest + coverage on the security/integrity/validation libs.
- **M0.3** — CI lint + test + audit gates.
- **M1.4** — Electron/dependency upgrade.
- ~~**M3.3** — Retire `scratch/` scripts into the suite.~~ **Done (v1.0.9 / W3).**

---

## 4. Execution Order (do not reorder)

1. **Test harness + CI gate** — QW4 → M0.1 → M0.2 → M0.3. *Nothing else is safe until the boundary is covered and CI enforces it.*
2. **Shell injection fix** — QW1 / M1.1. *Highest-severity exploit; small and now test-backed.*
3. **Integrity claim correction** — QW2 → M1.2. *Stop asserting a guarantee the code doesn't provide.*
4. **Path validation** — M1.3. *Close the renderer→disk traversal gap.*
5. **Electron / dependency upgrade** — M1.4. *Clears the CVE backlog; do after CI can catch regressions.*
6. **God-file extraction** — M2.1 → M2.2 → M2.3 (+ M2.4). *Refactor only now that tests guard behavior.* **In progress:** M2.4 done (W2); M2.1 underway as v1.0.9 / W5 (one domain per PR — process ✅ merged, terminal open (#11), remaining domains queued); M2.2/M2.3 not started.
7. **Polish** — M3.x as capacity allows.

**Definition of done (release gate):** CI fails on lint/test/high-audit; `commandSafety` + `manifestValidation` + `governanceIntegrity` ≥80% coverage; zero shell-string command construction from renderer input; every "signature/seal" string is HMAC-backed or renamed; one version string across manifest/tag/docs; `LICENSE` present.

---

## Open Questions (block specific tasks until answered)

- **Threat model for integrity** — accidental-corruption detection vs. tamper resistance vs. cross-machine non-repudiation? Decides QW2 rename vs. M1.2 HMAC vs. asymmetric signing.
- **Shared/team manifests on the roadmap?** If yes, QW1/M1.3 rise to Critical (remote-triggerable).
- **Current real version / pre- vs post-1.0?** Sets how strictly the "enterprise/compliance" features are held to their claims (QW3, M3.2).
