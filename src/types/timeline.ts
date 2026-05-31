export interface TimelineEvent {
  id: string;
  schemaVersion: "agentdeck.timeline.v1";
  timestamp: string;
  workspaceId: string;
  type: 
    | 'failure_converted'
    | 'regression_executed'
    | 'run_approved'
    | 'run_rejected'
    | 'baseline_promoted'
    | 'service_started'
    | 'service_stopped'
    | 'manifest_saved'
    | 'quick_action_triggered'
    | 'release_candidate_created'
    | 'release_candidate_approved'
    | 'release_candidate_rejected'
    | 'release_candidate_released';
  severity: 'info' | 'success' | 'warning' | 'error';
  actor: 'operator' | 'system' | 'simulator';
  isSeeded?: boolean;
  referenceId?: string;
  summary: string;
  metadata?: {
    logsSnapshot?: string[];
    benchmarkScore?: number;
    baselineScore?: number;
    passRate?: number;
    failuresCount?: number;
    runDetails?: any;
    [key: string]: any;
  };
}
