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

  // Documents a KNOWN false-positive from the audit (M2.4): the word-boundary
  // pattern flags legitimate commands that merely contain "rm"/"del". This test
  // pins current behavior so the M2.4 de-noise work has a regression baseline.
  it('KNOWN false positive: flags "npm rm <pkg>" (baseline for M2.4)', () => {
    expect(checkCommandSafety('npm rm left-pad', WS).safe).toBe(false);
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
