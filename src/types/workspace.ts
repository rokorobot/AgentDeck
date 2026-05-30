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

export interface Workspace {
  schemaVersion?: string;
  id: string;
  name: string;
  rootPath: string;
  previewUrl: string;
  health?: WorkspaceHealth;
  commands?: WorkspaceCommand[];
  terminals: TerminalPreset[];
}

export interface SystemLogEntry {
  timestamp?: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  workspaceId?: string;
}
