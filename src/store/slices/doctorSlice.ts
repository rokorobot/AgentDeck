import { DoctorReport } from '../../types/doctor';
import type { WorkspaceSliceCreator } from './types';
import type { WorkspaceStore } from '../workspaceStore';

/**
 * Doctor domain slice (W6-3 p1 — first domain extracted from workspaceStore).
 *
 * Behavior-preserving move of `doctorReport` + the three Doctor actions out of
 * the monolithic store. It stays part of the SAME Zustand store: the root store
 * spreads `createDoctorSlice(set, get)` into its object literal, so the single
 * shared `(set, get)` closure is preserved. `get()` still returns the full
 * `WorkspaceStore`, so `get().activeWorkspace` and `get().addSystemLog(...)`
 * resolve exactly as they did inline, and the inbound coupling from
 * `loadEvalsData()` — which calls `get().runDoctorChecks()` — keeps working
 * without any change to the caller. Action bodies are copied verbatim.
 */
export interface DoctorSlice {
  doctorReport: DoctorReport | null;
  runDoctorChecks(): Promise<void>;
  repairWorkspaceCheck(checkId: string): Promise<{ success: boolean; error?: string }>;
  exportDiagnosticBundle(): Promise<{ success: boolean; error?: string }>;
}

export const createDoctorSlice: WorkspaceSliceCreator<WorkspaceStore, DoctorSlice> = (set, get) => ({
  doctorReport: null,

  runDoctorChecks: async () => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return;
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;

    try {
      const report = await window.api.doctor.runChecks(rootPath, presetId);
      set({ doctorReport: report });
    } catch (err) {
      console.error("Failed to run doctor checks", err);
    }
  },

  repairWorkspaceCheck: async (checkId) => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return { success: false, error: "No active workspace." };
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;

    try {
      const result = await window.api.doctor.repair(rootPath, presetId, checkId);
      await get().runDoctorChecks();
      return result;
    } catch (err: any) {
      console.error(`Failed to repair check ${checkId}`, err);
      return { success: false, error: err.message };
    }
  },

  exportDiagnosticBundle: async () => {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) return { success: false, error: "No active workspace." };
    const rootPath = activeWorkspace.rootPath || null;
    const presetId = activeWorkspace.id;

    try {
      const result = await window.api.doctor.exportDiagnosticBundle(rootPath, presetId);
      if (result.success) {
        await get().addSystemLog(`Diagnostic bundle exported successfully`, 'success');
      }
      return result;
    } catch (err: any) {
      console.error("Failed to export diagnostic bundle", err);
      return { success: false, error: err.message };
    }
  },
});
