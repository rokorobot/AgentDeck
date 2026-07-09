import type { WorkspaceSliceCreator } from './types';
import type { WorkspaceStore } from '../workspaceStore';

/**
 * Provenance domain slice (W6-3 p2 — second domain extracted from workspaceStore).
 *
 * Behavior-preserving move of `provenanceList` + `loadProvenance` /
 * `recordProvenance` out of the monolith. It stays part of the SAME Zustand
 * store: the root store spreads `createProvenanceSlice(set, get, store)` into its
 * object literal, so the single shared `(set, get)` closure is preserved.
 *
 * Provenance is a leaf (nothing it owns reaches out beyond `activeWorkspace`),
 * but `recordProvenance()` is an INBOUND utility called from several domains via
 * `get().recordProvenance(...)` (saveActiveWorkspace, promoteToBaseline,
 * convertFailureToTestCase, saveGovernancePolicies, updateReleaseCandidateStatus,
 * restoreSnapshot, saveGoldStandard, deleteGoldStandard). Those callers stay in
 * their own domains and keep calling `get().recordProvenance(...)` through the
 * shared closure — unchanged. Note `loadEvalsData()` also loads provenance
 * inline as part of its atomic cross-domain hydration batch and is intentionally
 * left in place (it writes `provenanceList` via the shared `set`). Action bodies
 * are copied verbatim.
 */
export interface ProvenanceSlice {
  provenanceList: any[];
  loadProvenance(): Promise<void>;
  recordProvenance(
    type: 'baseline_promoted' | 'failure_converted' | 'policy_updated' | 'release_candidate_updated' | 'snapshot_restored' | 'manifest_saved' | 'gold_standard_saved' | 'gold_standard_deleted',
    source: 'timeline_event' | 'benchmark' | 'failure' | 'policy' | 'release_candidate' | 'snapshot' | 'manifest' | 'gold_standard',
    sourceId: string,
    before: any,
    after: any
  ): Promise<void>;
}

export const createProvenanceSlice: WorkspaceSliceCreator<WorkspaceStore, ProvenanceSlice> = (set, get) => ({
  provenanceList: [],

  loadProvenance: async () => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return;
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;

    const records = await window.api.provenance.loadAll(rootPath, presetId);
    set({ provenanceList: records });
  },

  recordProvenance: async (type, source, sourceId, before, after) => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return;
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;

    const record = {
      schemaVersion: "agentdeck.provenance.v1",
      id: `prov_${crypto.randomUUID()}`,
      timestamp: new Date().getTime(),
      actor: "operator", // Could be dynamic later
      mutationType: type,
      sourceType: source,
      sourceId,
      before,
      after
    };

    try {
      const savedRecord = await window.api.provenance.recordMutation(rootPath, presetId, record);
      set((state) => ({
        provenanceList: [savedRecord, ...state.provenanceList]
      }));
    } catch (err) {
      console.error("Failed to record provenance mutation", err);
    }
  },
});
