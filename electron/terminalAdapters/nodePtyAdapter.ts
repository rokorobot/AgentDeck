import { ITerminalAdapter } from './interface';

export class NodePtyAdapter implements ITerminalAdapter {
  private ptyProcess: any;

  constructor(shell: string, args: string[], cwd: string, cols = 80, rows = 24) {
    // Dynamic import to prevent startup crash if node-pty module is not built/installed
    const pty = require('node-pty');
    this.ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-color',
      } as Record<string, string>,
    });
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    try {
      this.ptyProcess.resize(cols, rows);
    } catch (e) {
      console.error('Error resizing node-pty process:', e);
    }
  }

  kill(): void {
    try {
      this.ptyProcess.kill();
    } catch (e) {
      console.error('Error killing node-pty process:', e);
    }
  }

  onData(callback: (data: string) => void): void {
    this.ptyProcess.onData(callback);
  }

  onExit(callback: (exitCode: number) => void): void {
    this.ptyProcess.onExit(({ exitCode }: { exitCode: number }) => callback(exitCode));
  }

  getPid(): number {
    return this.ptyProcess.pid;
  }
}
