import { execFile } from 'child_process';
import crypto from 'crypto';
import { TerminalManager } from './terminalManager';
import { BrowserWindow } from 'electron';
import { addSystemLogInternal } from './logger';
import { buildTaskkillArgs } from '../src/lib/processKill';

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

class ProcessManager {
  private processes = new Map<string, ManagedProcess>();

  getProcesses(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  async startProcess(
    workspaceId: string,
    cmd: { id: string; label: string; command: string; shell: string },
    cwd: string,
    terminalManager: TerminalManager,
    mainWindow: BrowserWindow
  ): Promise<ManagedProcess> {
    // 'run-' prefix is load-bearing: workspaceStore.ts dispatches terminal
    // session type (managed process vs. raw shell) via startsWith('run-').
    const runId = `run-${workspaceId}-${cmd.id}-${crypto.randomUUID()}`;
    
    // Spawn terminal
    const res = terminalManager.createTerminal(runId, cmd.shell, [], cwd, 80, 24);
    const pid = terminalManager.getPid(runId);

    const proc: ManagedProcess = {
      id: runId,
      workspaceId,
      commandId: cmd.id,
      label: cmd.label,
      pid,
      terminalSessionId: runId,
      command: cmd.command,
      shell: cmd.shell,
      cwd,
      status: 'starting',
      startedAt: new Date().toISOString(),
    };

    this.processes.set(runId, proc);
    addSystemLogInternal(`PROCESS_START_REQUESTED: Spawned managed action "${cmd.label}" on PID ${pid} (${cmd.shell})`, 'info', workspaceId);

    // Stream command execution string to TTY shell context
    setTimeout(() => {
      terminalManager.write(runId, cmd.command + '\r');
      proc.status = 'running';
      this.notifyStateChange(mainWindow);
    }, 600);

    return proc;
  }

  async stopProcess(runId: string, terminalManager: TerminalManager, mainWindow: BrowserWindow): Promise<boolean> {
    const proc = this.processes.get(runId);
    if (!proc) return false;

    proc.status = 'stopped';
    proc.stoppedAt = new Date().toISOString();
    
    addSystemLogInternal(`PROCESS_STOP_REQUESTED: Requesting stop for run "${proc.label}" (PID ${proc.pid})`, 'warning', proc.workspaceId);

    return new Promise((resolve) => {
      // Call taskkill to kill process tree recursively on Windows.
      // execFile with an argv array (no shell) — the PID is a literal argument.
      execFile('taskkill', buildTaskkillArgs(proc.pid), (err) => {
        if (err) {
          console.warn(`taskkill failed for PID ${proc.pid}:`, err.message);
        }
        
        addSystemLogInternal(`PROCESS_TREE_KILLED: Process tree for PID ${proc.pid} terminated`, 'warning', proc.workspaceId);
        
        // Terminate TTY session
        try {
          terminalManager.kill(runId);
        } catch (e) {
          console.error('Error killing TTY session during stop:', e);
        }

        addSystemLogInternal(`PROCESS_EXIT_CONFIRMED: Exit confirmed for run "${proc.label}"`, 'info', proc.workspaceId);
        this.notifyStateChange(mainWindow);
        resolve(true);
      });
    });
  }

  async restartProcess(
    runId: string,
    terminalManager: TerminalManager,
    mainWindow: BrowserWindow
  ): Promise<ManagedProcess | null> {
    const proc = this.processes.get(runId);
    if (!proc) return null;

    const { workspaceId, commandId, label, command, shell, cwd } = proc;

    // 1. Stop existing process
    await this.stopProcess(runId, terminalManager, mainWindow);

    // 2. Wait a moment
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Spawn fresh process
    return this.startProcess(
      workspaceId,
      { id: commandId, label, command, shell },
      cwd,
      terminalManager,
      mainWindow
    );
  }

  private notifyStateChange(mainWindow: BrowserWindow) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process:state-changed', this.getProcesses());
      // Also trigger frontend reload request by emitting standard event
      mainWindow.webContents.send('logs:changed');
    }
  }
}

export const processManager = new ProcessManager();

