export interface TerminalPreset {
  name: string;
  shell: string;
  cwd?: string;
  command?: string;
}

export interface WorkspaceCommand {
  id: string;
  label: string;
  shell: string;
  command: string;
}

export interface WorkspaceHealth {
  type: 'http' | 'tcp';
  url: string;
}

export interface ManagedProcess {
  id: string;
  workspaceId: string;
  commandId: string;
  label: string;
  pid: number;
  terminalSessionId: string;
  command: string;
  shell: string;
  cwd: string;
  status: "starting" | "running" | "stopped" | "failed";
  startedAt: string;
  stoppedAt?: string;
  exitCode?: number;
}

export interface WorkspaceService {
  id: string;
  label: string;
  shell: string;
  command: string;
  cwd?: string;
  health?: WorkspaceHealth;
}

export interface WorkspaceQuickAction {
  id: string;
  label: string;
  type: 'openFolder' | 'previewUrl' | 'command' | 'startService';
  command?: string;
  serviceId?: string;
  url?: string;
}

export interface Workspace {
  schemaVersion?: string;
  id: string;
  name: string;
  rootPath: string;
  previewUrl: string;
  health?: WorkspaceHealth;
  commands?: WorkspaceCommand[]; // Backward compatibility for v1
  services?: WorkspaceService[];  // For v2
  quickActions?: WorkspaceQuickAction[]; // For v2
  terminals: TerminalPreset[];
}

export interface SystemLogEntry {
  timestamp?: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  workspaceId?: string;
}
