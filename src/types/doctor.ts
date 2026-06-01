export type DiagnosticStatus = 'passed' | 'warning' | 'failed';

export interface DiagnosticCheck {
  id: string; // unique key for the check, e.g. 'folders-exist', 'gov-schema', etc.
  name: string;
  description: string;
  status: DiagnosticStatus;
  message: string;
  repairable: boolean;
  repairType: 'seal' | 'remediate' | 'backup-repair' | 'recreate' | 'prune' | 'none';
  repairSuggestion?: string;
  details?: any; // Extra payload (e.g. lists of missing folders, tampered ids)
}

export interface DoctorReport {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: number;
  checks: DiagnosticCheck[];
}
