import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { ITerminalAdapter } from './interface';

export class SpawnAdapter implements ITerminalAdapter {
  private child: ChildProcessWithoutNullStreams;
  private dataCallbacks: ((data: string) => void)[] = [];
  private exitCallbacks: ((exitCode: number) => void)[] = [];

  constructor(shell: string, args: string[], cwd: string) {
    // If the shell is powershell.exe, inject flags to keep it interactive and suppress logo
    let spawnShell = shell;
    let spawnArgs = [...args];
    
    if (shell.toLowerCase() === 'powershell.exe' || shell.toLowerCase() === 'powershell') {
      if (spawnArgs.length === 0) {
        spawnArgs = ['-NoLogo', '-Interactive'];
      }
    }

    this.child = spawn(spawnShell, spawnArgs, {
      cwd,
      env: {
        ...process.env,
        // Inform tools they are running inside a shell terminal context
        TERM: 'xterm-color',
      },
      shell: false
    });

    this.child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      this.dataCallbacks.forEach((cb) => cb(text));
    });

    this.child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      this.dataCallbacks.forEach((cb) => cb(text));
    });

    this.child.on('exit', (code) => {
      this.exitCallbacks.forEach((cb) => cb(code ?? 0));
    });

    this.child.on('error', (err) => {
      const errMsg = `\r\n\x1b[31m[Console Error: Failed to spawn process - ${err.message}]\x1b[0m\r\n`;
      this.dataCallbacks.forEach((cb) => cb(errMsg));
    });

    // Write a helpful console banner showing this is a fallback terminal process
    setTimeout(() => {
      const banner = `\r\n\x1b[33m[TM4 Console: Active shell - Spawn Fallback Mode (node-pty unavailable)]\x1b[0m\r\n\r\n`;
      this.dataCallbacks.forEach((cb) => cb(banner));
    }, 100);
  }

  write(data: string): void {
    if (this.child.stdin.writable) {
      // In spawn mode, keys are written to stdin.
      // If we receive carriage return '\r' from xterm.js, normalize to '\r\n' for Windows processes
      if (data === '\r') {
        this.child.stdin.write('\r\n');
      } else {
        this.child.stdin.write(data);
      }
    }
  }

  resize(cols: number, rows: number): void {
    // child_process.spawn does not support native PTY resizing
  }

  kill(): void {
    try {
      this.child.kill();
    } catch (e) {
      console.error('Error killing spawned child process:', e);
    }
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  onExit(callback: (exitCode: number) => void): void {
    this.exitCallbacks.push(callback);
  }

  getPid(): number {
    return this.child.pid || 0;
  }
}
