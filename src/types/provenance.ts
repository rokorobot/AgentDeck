export type ProvenanceMutationType = 
  | 'baseline_promoted'
  | 'failure_converted'
  | 'policy_updated'
  | 'release_candidate_updated'
  | 'snapshot_restored'
  | 'manifest_saved'
  | 'gold_standard_saved'
  | 'gold_standard_deleted';

export type ProvenanceSource = 
  | 'timeline_event'
  | 'benchmark'
  | 'failure'
  | 'policy'
  | 'release_candidate'
  | 'snapshot'
  | 'manifest'
  | 'gold_standard';

export interface ProvenanceRecord {
  schemaVersion: "agentdeck.provenance.v1";
  id: string;
  timestamp: number;
  actor: "operator" | "system" | "simulator";
  mutationType: ProvenanceMutationType;
  sourceType: ProvenanceSource;
  sourceId: string;
  before: any; // Delta configurations or target parameters
  after: any; // Delta configurations or target parameters
  hash?: string;
  integrityStatus?: "verified" | "unsigned" | "tampered";
}
