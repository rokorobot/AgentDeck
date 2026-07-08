import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateCommand,
  isPathSafe,
  isCommandDangerous,
  approveCommand,
  isCommandApproved,
} from '../electron/commandSafety';

// First direct coverage of the AUTHORITATIVE backend enforcement path
// (electron/commandSafety.ts). This is the real security boundary, invoked
// from terminalManager before writing to the PTY; previously it had no tests.

const WS = 'C:\\Users\\dev\\workspace';

afterEach(() => {
  vi.useRealTimers();
});

describe('validateCommand — enforcement', () => {
  it('blocks a destructive command with a reason', () => {
    const result = validateCommand('rm -rf /', WS);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/destructive/i);
  });

  it('allows an ordinary safe command', () => {
    expect(validateCommand('npm run dev', WS).safe).toBe(true);
  });

  it('allows the de-noised package-manager rm (shared policy applied on the backend too)', () => {
    expect(validateCommand('npm rm left-pad', WS).safe).toBe(true);
  });

  it('blocks a path-traversal command with a workspace-scope reason', () => {
    const result = validateCommand('type C:\\Windows\\System32\\config', WS);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/outside workspace/i);
  });
});

describe('validateCommand — approval allowlist with TTL', () => {
  it('lets a previously-approved dangerous command through, then re-blocks after the 5s TTL', () => {
    vi.useFakeTimers();
    const cmd = 'rm -rf ./build-artifacts-approved-test';

    // Not approved yet -> blocked.
    expect(validateCommand(cmd, WS).safe).toBe(false);

    // Approve -> bypasses the dangerous check within the TTL window.
    approveCommand(cmd);
    expect(isCommandApproved(cmd)).toBe(true);
    expect(validateCommand(cmd, WS).safe).toBe(true);

    // After the 5-second expiry the approval is gone and it re-blocks.
    vi.advanceTimersByTime(5000);
    expect(isCommandApproved(cmd)).toBe(false);
    expect(validateCommand(cmd, WS).safe).toBe(false);
  });
});

describe('isPathSafe — authoritative Node path.relative traversal check', () => {
  it('allows a command with no path token', () => {
    expect(isPathSafe('npm run dev', WS)).toBe(true);
  });

  it('allows an absolute path inside the workspace', () => {
    expect(isPathSafe('cat C:\\Users\\dev\\workspace\\readme.md', WS)).toBe(true);
  });

  it('rejects an absolute path outside the workspace', () => {
    expect(isPathSafe('type C:\\Windows\\System32\\config', WS)).toBe(false);
  });

  it('rejects a parent-traversal relative path that escapes the workspace', () => {
    expect(isPathSafe('cat ..\\..\\secret.txt', WS)).toBe(false);
  });

  it('is a no-op (safe) when no workspace path is provided', () => {
    expect(isPathSafe('cat ..\\..\\secret.txt', '')).toBe(true);
  });
});

describe('isCommandDangerous — delegates to the shared policy', () => {
  it('agrees with the policy on blocked and de-noised commands', () => {
    expect(isCommandDangerous('rm -rf /')).toBe(true);
    expect(isCommandDangerous('ssh user@host')).toBe(true);
    expect(isCommandDangerous('npm rm left-pad')).toBe(false);
    expect(isCommandDangerous('cat ~/.ssh/config')).toBe(false);
  });
});
