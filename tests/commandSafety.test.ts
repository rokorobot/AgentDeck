import { describe, it, expect } from 'vitest';
import { checkCommandSafety } from '../src/lib/commandSafety';

const WS = 'C:/Users/dev/workspace';

describe('checkCommandSafety — dangerous patterns', () => {
  it('allows an empty command', () => {
    expect(checkCommandSafety('', WS).safe).toBe(true);
    expect(checkCommandSafety('   ', WS).safe).toBe(true);
  });

  it('allows an ordinary safe command', () => {
    expect(checkCommandSafety('npm run dev', WS).safe).toBe(true);
    expect(checkCommandSafety('git status', WS).safe).toBe(true);
    expect(checkCommandSafety('node build.js', WS).safe).toBe(true);
  });

  it.each([
    ['rm -rf /', 'rm'],
    ['del important.txt', 'del'],
    ['rmdir /s folder', 'rmdir'],
    ['format C:', 'format'],
    ['git reset --hard HEAD~5', 'git reset --hard'],
    ['git clean -fdx', 'git clean'],
    ['shutdown /s /t 0', 'shutdown'],
    ['scp secret.pem user@host:/tmp', 'scp'],
    ['ssh user@remote', 'ssh'],
  ])('flags %s as unsafe (%s)', (command) => {
    const result = checkCommandSafety(command, WS);
    expect(result.safe).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('is case-insensitive on dangerous keywords', () => {
    expect(checkCommandSafety('RM -RF /', WS).safe).toBe(false);
    expect(checkCommandSafety('ShutDown', WS).safe).toBe(false);
  });

  // W2 de-noise: the package-manager uninstall alias `npm rm <pkg>` is no
  // longer flagged (it is a package op, not a filesystem delete). A real rm in
  // any other context still triggers -- see commandPolicy.test.ts.
  it('no longer flags "npm rm <pkg>" (W2 de-noise)', () => {
    expect(checkCommandSafety('npm rm left-pad', WS).safe).toBe(true);
    expect(checkCommandSafety('pnpm rm foo', WS).safe).toBe(true);
  });
});

describe('checkCommandSafety — path escape heuristic', () => {
  it('flags parent-directory traversal', () => {
    expect(checkCommandSafety('cat ../../etc/passwd', WS).safe).toBe(false);
  });

  it('flags absolute drive paths outside the workspace', () => {
    const result = checkCommandSafety('type C:/Windows/System32/config', WS);
    expect(result.safe).toBe(false);
  });

  it('allows an absolute path that is inside the workspace', () => {
    const result = checkCommandSafety('cat C:/Users/dev/workspace/readme.md', WS);
    expect(result.safe).toBe(true);
  });
});
