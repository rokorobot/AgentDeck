export interface EvidenceSection {
  layerId: string; // e.g. 'candidate-summary', 'baseline-comparison', 'eval-evidence', etc.
  title: string;
  description: string;
  content: any; // Raw JSON payload frozen at generation time
}

export interface SignatureRecord {
  authority: string; // e.g. 'Release Board'
  timestamp: string;
  hash: string;
}

export interface DecisionEvidencePackage {
  schemaVersion: 'agentdeck.dep.v1';
  id: string; // DEP-YYYY-XXXXX
  timestamp: string;
  workspaceId: string;
  decisionClass: 'routine' | 'material' | 'critical';
  decisionType: 'approve' | 'reject' | 'rollback' | 'quarantine';
  releaseCandidateId: string;
  evidenceSnapshotHash: string; // Hash computed over frozen evidence data
  evidenceSufficiency: 'pass' | 'fail';
  evidenceSufficiencyDetails?: string[];
  decisionSummary: string; // board-ready narrative explanation
  decisionRationale: string; // human-authored board rationale
  recommendation: {
    decision: 'APPROVE' | 'REJECT';
    confidence: number; // e.g., 90
    boardRecommendation: 'APPROVE' | 'REJECT';
  };
  finalDecision: 'approve' | 'reject' | 'rollback' | 'quarantine';
  overrideReason?: string;
  generatedBy: string;
  generatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  evidence: EvidenceSection[];
  signatures: SignatureRecord[];
  hash?: string;
  integrityStatus?: 'verified' | 'unsigned' | 'tampered';
}
