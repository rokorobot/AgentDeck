import { BrowserWindow } from 'electron';
import { ITerminalAdapter } from './terminalAdapters/interface';
import { NodePtyAdapter } from './terminalAdapters/nodePtyAdapter';
import { SpawnAdapter } from './terminalAdapters/spawnAdapter';
import { validateCommand } from './commandSafety';
import { addSystemLogInternal } from './logger';

interface TerminalSession {
  id: string;
  adapter: ITerminalAdapter;
  commandBuffer: string;
  workspacePath: string;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private mainWindow: BrowserWindow | null = null;

  constructor() {}

  init(window: BrowserWindow) {
    this.mainWindow = window;
  }

  createTerminal(
    id: string,
    shell: string,
    args: string[],
    cwd: string,
    cols: number,
    rows: number,
    forceSpawn = false
  ) {
    if (!this.mainWindow) {
      throw new Error('TerminalManager not initialized with BrowserWindow');
    }

    let adapter: ITerminalAdapter;
    let type: 'node-pty' | 'spawn-fallback' = 'node-pty';
    const startTime = Date.now();

    if (forceSpawn) {
      adapter = new SpawnAdapter(shell, args, cwd);
      type = 'spawn-fallback';
    } else {
      try {
        // Attempt to initialize node-pty
        adapter = new NodePtyAdapter(shell, args, cwd, cols, rows);
        console.log(`[TerminalManager] Spawned session ${id} using node-pty`);
      } catch (e) {
        console.warn(`[TerminalManager] node-pty unavailable, falling back to child_process.spawn. Error:`, e);
        adapter = new SpawnAdapter(shell, args, cwd);
        type = 'spawn-fallback';
      }
    }

    const session: TerminalSession = {
      id,
      adapter,
      commandBuffer: '',
      workspacePath: cwd,
    };

    this.sessions.set(id, session);

    // Stream shell output to renderer
    adapter.onData((data) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(`terminal-data-${id}`, data);
      }
    });

    // Handle session exit
    adapter.onExit((code) => {
      console.log(`[TerminalManager] Session ${id} exited with code ${code}`);

      const duration = Date.now() - startTime;
      if (type === 'node-pty' && code < 0 && duration < 2000) {
        console.warn(`[TerminalManager] node-pty session ${id} crashed shortly after spawn (code ${code}). Re-spawning with spawn-fallback.`);
        addSystemLogInternal(`[Terminal Fallback: node-pty failed for session "${id}" (exit code ${code}). Automatically recovered using child_process.spawn fallback]`, 'warning');
        
        try {
          this.createTerminal(id, shell, args, cwd, cols, rows, true);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(`terminal-fallback-recreated-${id}`);
          }
          return;
        } catch (err) {
          console.error(`[TerminalManager] Fallback spawn failed for session ${id}:`, err);
        }
      }

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(`terminal-exit-${id}`, code);
      }
      this.sessions.delete(id);
    });

    return { id, type };
  }

  write(id: string, data: string) {
    const session = this.sessions.get(id);
    if (!session) return;

    // Handle pasted blocks (multi-character input)
    if (data.length > 1) {
      const validation = validateCommand(data, session.workspacePath);
      if (!validation.safe) {
        this.sendWarningToTerminal(id, `\r\n\x1b[31m[AgentDeck Safety Gate: Blocked pasted execution. Reason: ${validation.reason}]\x1b[0m\r\n`);
        addSystemLogInternal(`[Safety Gate Blocked Paste: "${data.trim()}" in session "${id}". Reason: ${validation.reason}]`, 'error');
        return;
      }
      
      session.adapter.write(data);
      
      // Update command buffer if it's a single command execution
      if (data.includes('\r') || data.includes('\n')) {
        session.commandBuffer = '';
      } else {
        session.commandBuffer += data;
      }
      return;
    }

    // Process single-character keystrokes
    if (data === '\r' || data === '\n' || data === '\r\n') {
      const command = session.commandBuffer;
      session.commandBuffer = ''; // Reset buffer for next line

      const validation = validateCommand(command, session.workspacePath);
      if (!validation.safe) {
        this.sendWarningToTerminal(id, `\r\n\x1b[31m[AgentDeck Safety Gate: Blocked command. Reason: ${validation.reason}]\x1b[0m\r\n`);
        addSystemLogInternal(`[Safety Gate Blocked: "${command.trim()}" in session "${id}". Reason: ${validation.reason}]`, 'error');
        
        // Redraw terminal prompt by writing an empty character or backspaces
        // (This triggers shell to reprint the prompt without executing anything)
        session.adapter.write('\x03'); // Sends Ctrl+C to cancel current shell line buffer
        return;
      }

      session.adapter.write(data);
    } else if (data === '\x7f' || data === '\x08') {
      // Backspace
      if (session.commandBuffer.length > 0) {
        session.commandBuffer = session.commandBuffer.slice(0, -1);
      }
      session.adapter.write(data);
    } else if (data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
      // Standard printable characters
      session.commandBuffer += data;
      session.adapter.write(data);
    } else {
      // Ctrl characters, arrow keys, etc.
      session.adapter.write(data);
    }
  }

  resize(id: string, cols: number, rows: number) {
    const session = this.sessions.get(id);
    if (session) {
      session.adapter.resize(cols, rows);
    }
  }

  kill(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.adapter.kill();
      this.sessions.delete(id);
    }
  }

  getPid(id: string): number {
    const session = this.sessions.get(id);
    return session ? session.adapter.getPid() : 0;
  }

  killAll() {
    for (const [id, session] of this.sessions.entries()) {
      session.adapter.kill();
    }
    this.sessions.clear();
  }

  private sendWarningToTerminal(id: string, message: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`terminal-data-${id}`, message);
    }
  }
}
