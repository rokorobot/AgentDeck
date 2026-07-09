import { DecisionEvidencePackage } from '../../types/decisionEvidence';
import type { WorkspaceSliceCreator } from './types';
import type { WorkspaceStore } from '../workspaceStore';

/**
 * Decision Evidence Package (DEP) domain slice (W6-3 p3 — third domain extracted).
 *
 * Behavior-preserving move of `decisionEvidenceList` + the six DEP actions out of
 * the monolith. It stays part of the SAME Zustand store: the root store spreads
 * `createDepSlice(set, get, store)` into its object literal, so the single shared
 * `(set, get)` closure is preserved.
 *
 * Cross-domain note (pre-approved, preserved verbatim): `signAndSaveDecisionEvidence`
 * on success reloads governance data via `window.api.governance.loadData(...)` and
 * writes `releaseCandidates` into the store via the shared `set`. That governance
 * refresh/write is EXISTING behavior and is kept exactly — the governance domain is
 * NOT moved; only DEP's action carries the call, as it did inline. `set(...)` is
 * typed against the full `WorkspaceStore`, so writing `releaseCandidates` is valid.
 *
 * Residual note: `loadEvalsData()` also loads DEP inline (`dep.loadAll` +
 * `decisionEvidenceList` write) as part of its atomic cross-domain hydration batch;
 * it is intentionally left in place (accepted residual, mirroring the p2 provenance
 * ruling). Action bodies are copied verbatim.
 */
export interface DepSlice {
  decisionEvidenceList: DecisionEvidencePackage[];
  loadDecisionEvidence(): Promise<void>;
  generateDecisionEvidence(candidateId: string): Promise<DecisionEvidencePackage>;
  signAndSaveDecisionEvidence(
    dep: DecisionEvidencePackage,
    decisionRationale: string,
    decisionClass: 'routine' | 'material' | 'critical',
    overrideReason?: string
  ): Promise<{ success: boolean; dep?: DecisionEvidencePackage; error?: string }>;
  verifyDecisionEvidence(depId: string): Promise<{
    success: boolean;
    hashValid?: boolean;
    signatureValid?: boolean;
    rcExists?: boolean;
    snapshotExists?: boolean;
    provenanceExists?: boolean;
    integrityStatus?: 'verified' | 'unsigned' | 'tampered';
    error?: string;
  }>;
  exportDecisionEvidenceJson(depId: string): Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportDecisionEvidenceMarkdown(depId: string): Promise<{ success: boolean; filePath?: string; error?: string }>;
}

export const createDepSlice: WorkspaceSliceCreator<WorkspaceStore, DepSlice> = (set, get) => ({
  decisionEvidenceList: [],

  loadDecisionEvidence: async () => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return;
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;
    try {
      const deps = await window.api.dep.loadAll(rootPath, presetId);
      set({ decisionEvidenceList: deps || [] });
    } catch (err) {
      console.error('Failed to load decision evidence', err);
    }
  },

  generateDecisionEvidence: async (candidateId: string) => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) throw new Error("No active workspace.");
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;
    return await window.api.dep.generate(rootPath, presetId, candidateId);
  },

  signAndSaveDecisionEvidence: async (
    dep: DecisionEvidencePackage,
    decisionRationale: string,
    decisionClass: 'routine' | 'material' | 'critical',
    overrideReason?: string
  ) => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return { success: false, error: "No active workspace." };
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;
    try {
      const result = await window.api.dep.signAndSave(
        rootPath,
        presetId,
        dep,
        decisionRationale,
        decisionClass,
        overrideReason
      );
      if (result.success) {
        await get().addSystemLog(`Decision package ${dep.id} signed and archived successfully`, 'success');
        await get().loadDecisionEvidence();
        // Reload candidates as status changed
        const govData = await window.api.governance.loadData(rootPath, presetId);
        set({ releaseCandidates: govData.releaseCandidates || [] });
      }
      return result;
    } catch (err: any) {
      console.error('Failed to sign and save decision evidence', err);
      return { success: false, error: err.message };
    }
  },

  verifyDecisionEvidence: async (depId: string) => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return { success: false, error: "No active workspace." };
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;
    return await window.api.dep.verify(rootPath, presetId, depId);
  },

  exportDecisionEvidenceJson: async (depId: string) => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return { success: false, error: "No active workspace." };
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;
    return await window.api.dep.exportJson(rootPath, presetId, depId);
  },

  exportDecisionEvidenceMarkdown: async (depId: string) => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return { success: false, error: "No active workspace." };
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;
    return await window.api.dep.exportMarkdown(rootPath, presetId, depId);
  },
});
