export interface WorkspaceEvalConfig {
  script?: string;
  baselineThreshold?: number;
}

export interface BenchmarkTestCase {
  id: string;
  benchmarkId: string;
  sourceFailureId?: string;
  prompt: string;
  expected: string;
  threshold: number;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  description?: string;
  criteria: string[];
  baselineScore: number;
  goldStandardsCount?: number;
  testCases?: BenchmarkTestCase[];
}

export interface TestCaseRunResult {
  caseId: string;
  prompt: string;
  status: 'pass' | 'fail';
  score: number;
  isImproved?: boolean;
  isRegressed?: boolean;
}

export interface BenchmarkReport {
  passRate: number;
  baselineScore: number;
  currentScore: number;
  results: TestCaseRunResult[];
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
  report?: BenchmarkReport;
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
  converted?: boolean;
  convertedToBenchmarkId?: string;
  convertedToTestCaseId?: string;
}

export interface GoldStandard {
  id: string;
  title: string;
  content: string;
  tags: string[];
  type: 'prompt' | 'output' | 'document' | 'rubric';
  source?: string;
  createdAt: string;
}

export interface JudgeDefinition {
  id: string;
  name: string;
  criteria: string[];
  threshold: number;
}

export interface PromotionHistoryRecord {
  timestamp: string;
  benchmarkId: string;
  benchmarkName: string;
  oldScore: number;
  newScore: number;
  approvedBy: string;
  reason?: string;
  runId?: string;
}
