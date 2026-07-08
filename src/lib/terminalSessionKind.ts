// A managed-process terminal session is tagged with the literal 'run-' id
// prefix (see the runId generator in electron/processManager.ts). The store
// uses this to decide whether a terminal tab is a managed service run (must
// be preserved across workspace switches, routed through stopManagedProcess
// on kill) or a raw interactive shell (killed freely).
//
// This holds regardless of what comes after the prefix -- a legacy
// Date.now()-suffixed id or a crypto.randomUUID()-suffixed id are both
// still managed-process ids, since only the prefix is load-bearing. Kept as
// a single small helper (audit W1) so both call sites in workspaceStore.ts
// stay in sync and the contract is independently testable.
export function isManagedProcessSessionId(id: string): boolean {
  return id.startsWith('run-');
}
