export interface SnapshotManifest {
  schemaVersion: "agentdeck.snapshot.v1";
  snapshotId: string;
  createdAt: string;
  workspaceId: string;
  description: string;
  type: "manual" | "auto-backup" | "pre-restore";
  hash: string;
  integrityStatus: 'verified' | 'unsigned' | 'tampered';
  parentSnapshotId?: string;
}

export interface SnapshotPayload {
  manifest: any; // Workspace config manifest
  benchmarks: any[];
  failures: any[];
  goldStandards: any[];
  judges: any[];
  promotions: any[];
  regressionRuns: any[];
  policies: any;
  releaseCandidates: any[];
  timelineEvents: any[];
}

export interface WorkspaceSnapshot {
  manifest: SnapshotManifest;
  payload: SnapshotPayload;
}
