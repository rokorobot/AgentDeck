import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installWindowApiStub } from './windowApiStub';

// W6-0 CHARACTERIZATION SAFETY NET for src/store/workspaceStore.ts.
//
// Purpose: lock current, observable store behavior BEFORE any W6 slicing —
// initialization, an evaluation happy path, cross-domain side-effect chains
// (timeline write + governance→provenance), and a system/reset path. These
// assertions are the "no behavior change" gate for future store decomposition.
// This does NOT aim for full coverage.
//
// Each test gets a FRESH store instance (vi.resetModules + dynamic import) with
// window.api installed first, so there is no cross-test state bleed and no real
// Electron/IPC/filesystem access.

async function freshStore(overrides: Record<string, Record<string, (...a: any[]) => any>> = {}) {
  const api = installWindowApiStub(overrides);
  vi.resetModules();
  const mod = await import('../../src/store/workspaceStore');
  return { store: mod.useWorkspaceStore, api };
}

beforeEach(() => {
  vi.useFakeTimers(); // init() installs a polling interval; keep it inert + deterministic
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('workspaceStore — initialization', () => {
  it('init() resolves without an Electron runtime and loads presets into state', async () => {
    const preset = { id: 'tm4', name: 'TM4 Studio', rootPath: null, terminals: [] };
    const { store, api } = await freshStore({
      workspaces: { loadAll: vi.fn(async () => [preset]) },
    });

    await store.getState().init();

    // Startup reads were issued through the injected api boundary.
    expect(api.layout.load).toHaveBeenCalled();
    expect(api.logs.load).toHaveBeenCalled();
    expect(api.process.list).toHaveBeenCalled();
    expect(api.workspaces.loadAll).toHaveBeenCalled();

    // Preset landed in state and became active.
    const s = store.getState();
    expect(s.workspaces.map((w: any) => w.id)).toContain('tm4');
    expect(s.activeWorkspace?.id).toBe('tm4');
    expect(s.ollamaStatus).toEqual({ running: false, models: [] });
  });
});

describe('workspaceStore — evaluations happy path', () => {
  it('loadEvalsData() populates eval domains from window.api.evals.loadData', async () => {
    const payload = {
      benchmarks: [{ id: 'b1', name: 'B1' }],
      runs: [{ id: 'r1', benchmarkId: 'b1', status: 'pass', isApproved: true, score: 0.9, baselineScore: 0.8, failuresCount: 0, timestamp: '2026-01-01T00:00:00.000Z' }],
      failures: [{ id: 'f1', resolved: false }],
      goldStandards: [{ id: 'g1' }],
      judges: [{ id: 'j1' }],
      promotions: [{ runId: 'r1' }],
    };
    const { store, api } = await freshStore({
      evals: { loadData: vi.fn(async () => payload) },
    });
    // loadEvalsData early-returns without an active workspace — seed one.
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().loadEvalsData();

    expect(api.evals.loadData).toHaveBeenCalledWith(null, 'tm4');
    const s = store.getState();
    expect(s.benchmarks.map((b: any) => b.id)).toEqual(['b1']);
    expect(s.regressionRuns.map((r: any) => r.id)).toEqual(['r1']);
    expect(s.failures.map((f: any) => f.id)).toEqual(['f1']);
    expect(s.goldStandards.map((g: any) => g.id)).toEqual(['g1']);
    expect(s.judges.map((j: any) => j.id)).toEqual(['j1']);
    expect(s.promotions).toHaveLength(1);
  });
});

describe('workspaceStore — cross-domain side-effect chains', () => {
  it('addTimelineEvent() persists via timeline.saveEvent AND prepends to timelineEvents', async () => {
    const { store, api } = await freshStore();
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().addTimelineEvent('service_started', 'ref-1', 'Service started', { foo: 'bar' });

    expect(api.timeline.saveEvent).toHaveBeenCalledTimes(1);
    const [rootPathArg, presetIdArg, eventArg] = api.timeline.saveEvent.mock.calls[0];
    expect(rootPathArg).toBeNull();
    expect(presetIdArg).toBe('tm4');
    expect(eventArg.type).toBe('service_started');
    expect(eventArg.summary).toBe('Service started');
    // Newest-first prepend into state.
    const s = store.getState();
    expect(s.timelineEvents[0].referenceId).toBe('ref-1');
  });

  it('saveGovernancePolicies() writes governance AND records provenance (coupled domains)', async () => {
    const { store, api } = await freshStore();
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().saveGovernancePolicies({
      schemaVersion: 'agentdeck.governance.v1', minScore: 0.9, allowRegression: false, requireApproval: true,
    } as any);

    // Governance domain write.
    expect(api.governance.savePolicies).toHaveBeenCalledTimes(1);
    expect(store.getState().governancePolicies?.minScore).toBe(0.9);
    // Coupled provenance side-effect (the exact chain W6 slicing must preserve).
    expect(api.provenance.recordMutation).toHaveBeenCalled();
  });
});

describe('workspaceStore — system/reset path', () => {
  it('addSystemLog() appends to systemLogs and forwards to logs.add', async () => {
    const { store, api } = await freshStore();
    const before = store.getState().systemLogs.length;

    await store.getState().addSystemLog('hello world', 'info');

    expect(api.logs.add).toHaveBeenCalled();
    expect(store.getState().systemLogs.length).toBe(before + 1);
  });

  it('approveSafetyCommand() delegates to safety.approveCommand and returns its result', async () => {
    const { store, api } = await freshStore({
      safety: { approveCommand: vi.fn(async () => true) },
    });
    const result = await store.getState().approveSafetyCommand('npm run build');
    expect(api.safety.approveCommand).toHaveBeenCalledWith('npm run build');
    expect(result).toBe(true);
  });
});

describe('workspaceStore — doctor domain (W6-3 p1 pre-slice characterization)', () => {
  // These pin the CURRENT inline Doctor behavior + its cross-domain coupling
  // before the DoctorSlice extraction, so the slice move is provably behavior-
  // preserving. Written against the un-moved code.

  it('runDoctorChecks() calls doctor.runChecks and stores the report (with active workspace)', async () => {
    const report = { status: 'healthy', timestamp: 0, checks: [] };
    const { store, api } = await freshStore({
      doctor: { runChecks: vi.fn(async () => report) },
    });
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().runDoctorChecks();

    expect(api.doctor.runChecks).toHaveBeenCalledWith(null, 'tm4');
    expect(store.getState().doctorReport).toEqual(report);
  });

  it('runDoctorChecks() early-returns without an active workspace (no API call, report stays null)', async () => {
    const { store, api } = await freshStore();
    // No active workspace seeded (default null).
    await store.getState().runDoctorChecks();

    expect(api.doctor.runChecks).not.toHaveBeenCalled();
    expect(store.getState().doctorReport).toBeNull();
  });

  it('repairWorkspaceCheck() calls doctor.repair, re-runs doctor checks, and returns the repair result', async () => {
    const repairResult = { success: false, error: 'still broken' };
    const { store, api } = await freshStore({
      doctor: { repair: vi.fn(async () => repairResult) },
    });
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    const result = await store.getState().repairWorkspaceCheck('check-1');

    expect(api.doctor.repair).toHaveBeenCalledWith(null, 'tm4', 'check-1');
    // Re-check coupling: repair unconditionally re-invokes runDoctorChecks().
    expect(api.doctor.runChecks).toHaveBeenCalledTimes(1);
    // Returns the repair result verbatim (not the re-check result).
    expect(result).toEqual(repairResult);
  });

  it('exportDiagnosticBundle() calls the API and logs on success', async () => {
    const { store, api } = await freshStore({
      doctor: { exportDiagnosticBundle: vi.fn(async () => ({ success: true })) },
    });
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    const result = await store.getState().exportDiagnosticBundle();

    expect(api.doctor.exportDiagnosticBundle).toHaveBeenCalledWith(null, 'tm4');
    expect(api.logs.add).toHaveBeenCalled(); // success path logs via addSystemLog
    expect(result).toEqual({ success: true });
  });

  it('loadEvalsData() triggers a doctor refresh at its tail (cross-domain inbound coupling)', async () => {
    const { store, api } = await freshStore();
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().loadEvalsData();

    // The evals-load path must keep pulling a fresh doctor report through the
    // shared store closure — this is the coupling the slice extraction preserves.
    expect(api.doctor.runChecks).toHaveBeenCalledWith(null, 'tm4');
  });
});

describe('workspaceStore — provenance domain (W6-3 p2 pre-slice characterization)', () => {
  // Provenance is a leaf slice (nothing it owns reaches out beyond activeWorkspace),
  // but recordProvenance() is an INBOUND utility called from several domains via
  // get().recordProvenance(...). These pin both the direct actions AND two inbound
  // caller chains from different domains, so the shared-closure contract is proven
  // to survive the slice move. Written against the un-moved inline code.

  it('loadProvenance() calls provenance.loadAll and stores the records (with active workspace)', async () => {
    const records = [{ id: 'prov-1' }, { id: 'prov-2' }];
    const { store, api } = await freshStore({
      provenance: { loadAll: vi.fn(async () => records) },
    });
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().loadProvenance();

    expect(api.provenance.loadAll).toHaveBeenCalledWith(null, 'tm4');
    expect(store.getState().provenanceList).toEqual(records);
  });

  it('loadProvenance() early-returns without an active workspace (no API call)', async () => {
    const { store, api } = await freshStore();
    await store.getState().loadProvenance();
    expect(api.provenance.loadAll).not.toHaveBeenCalled();
  });

  it('recordProvenance() calls provenance.recordMutation and prepends the saved record', async () => {
    const saved = { id: 'prov-saved' };
    const { store, api } = await freshStore({
      provenance: { recordMutation: vi.fn(async () => saved) },
    });
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().recordProvenance('policy_updated', 'policy', 'src-1', { a: 1 }, { a: 2 });

    expect(api.provenance.recordMutation).toHaveBeenCalledTimes(1);
    const [rootPathArg, presetIdArg, recordArg] = api.provenance.recordMutation.mock.calls[0];
    expect(rootPathArg).toBeNull();
    expect(presetIdArg).toBe('tm4');
    // The record the store constructs carries the mutation metadata verbatim.
    expect(recordArg.mutationType).toBe('policy_updated');
    expect(recordArg.sourceType).toBe('policy');
    expect(recordArg.sourceId).toBe('src-1');
    expect(recordArg.before).toEqual({ a: 1 });
    expect(recordArg.after).toEqual({ a: 2 });
    // Newest-first prepend of the API's returned record.
    expect(store.getState().provenanceList[0]).toEqual(saved);
  });

  it('recordProvenance() early-returns without an active workspace (no API call)', async () => {
    const { store, api } = await freshStore();
    await store.getState().recordProvenance('policy_updated', 'policy', 'src-1', null, null);
    expect(api.provenance.recordMutation).not.toHaveBeenCalled();
  });

  it('INBOUND (governance): saveGovernancePolicies() records provenance via get().recordProvenance()', async () => {
    const { store, api } = await freshStore();
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().saveGovernancePolicies({
      schemaVersion: 'agentdeck.governance.v1', minScore: 0.9, allowRegression: false, requireApproval: true,
    } as any);

    // The governance→provenance chain must keep flowing through the shared closure.
    expect(api.provenance.recordMutation).toHaveBeenCalled();
  });

  it('INBOUND (gold standards): saveGoldStandard() records provenance via get().recordProvenance()', async () => {
    const { store, api } = await freshStore();
    store.setState({ activeWorkspace: { id: 'tm4', name: 'TM4', rootPath: null } as any });

    await store.getState().saveGoldStandard({
      id: 'gold-1', title: 'G1', content: 'c', tags: ['t'], type: 'prompt', source: 'operator', createdAt: '2026-01-01T00:00:00.000Z',
    } as any);

    // A second inbound domain proves the coupling is not governance-specific.
    expect(api.evals.saveGoldStandard).toHaveBeenCalled();
    expect(api.provenance.recordMutation).toHaveBeenCalled();
  });
});
