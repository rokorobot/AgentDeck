import type { StateCreator } from 'zustand';

/**
 * Shared slice-creator type for the workspace store (W6-3 scaffolding, p0).
 *
 * The store is deliberately kept as ONE Zustand store composed from domain
 * slices, so the single shared `(set, get)` closure is preserved — every
 * existing cross-domain `get()` still sees the full combined store `S`. Each
 * domain slice is authored as a `StateCreator` over that full store `S` while
 * returning only its own slice `T`:
 *
 *   export const createDoctorSlice: WorkspaceSliceCreator<WorkspaceStore, DoctorSlice> =
 *     (set, get) => ({ ...doctor state + actions... });
 *
 * and the root store spreads the slices:
 *
 *   create<WorkspaceStore>()((...a) => ({ ...createDoctorSlice(...a), ... }));
 *
 * No domain behavior is moved by this scaffolding file — it only fixes the type
 * shape future slice PRs (starting with p1 DoctorSlice) will conform to.
 */
export type WorkspaceSliceCreator<S, T> = StateCreator<S, [], [], T>;
