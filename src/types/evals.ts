export interface WorkspaceEvalConfig {
  script?: string;
  baselineThreshold?: number;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  description?: string;
  criteria: string[];
  baselineScore: number;
  goldStandardsCount?: number;
}

export interface RegressionRun {
  id: string;
  benchmarkId: string;
  timestamp: string;
  score: number;
  baselineScore: number;
  diff: number;
  status: 'pass' | 'regression_detected';
  failuresCount: number;
  triggerContext: string;
  isSimulated?: boolean;
  isApproved?: boolean;
  isRejected?: boolean;
}

export interface ApprovalQueueItem {
  id: string;
  benchmarkId: string;
  runId: string;
  title: string;
  previousScore: number;
  currentScore: number;
  failuresCount: number;
  status: 'open' | 'approved' | 'rejected';
  submittedAt: string;
}

export interface FailureCase {
  id: string;
  benchmarkId: string;
  prompt: string;
  expected: string;
  actual: string;
  failureDescription: string;
  resolution?: string;
  resolved: boolean;
  timestamp: string;
}
