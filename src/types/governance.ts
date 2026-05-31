export interface GovernancePolicy {
  schemaVersion: "agentdeck.governance.v1";
  minScore: number;
  allowRegression: boolean;
  requireApproval: boolean;
  hash?: string;
  integrityStatus?: 'verified' | 'unsigned' | 'tampered';
}

export interface ReleaseCandidate {
  id: string;
  schemaVersion: "agentdeck.governance.v1";
  version: string; // e.g. "v1.0.0-rc1"
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected' | 'released';
  score: number;
  benchmarkId: string;
  failuresCount: number;
  timelineEventId: string; // reference to timeline event id
  policyResult: "pass" | "blocked" | "requires_approval";
  policyReasons: string[];
  baselineScore?: number;
  regressionDelta?: number;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  hash?: string;
  integrityStatus?: 'verified' | 'unsigned' | 'tampered';
}
