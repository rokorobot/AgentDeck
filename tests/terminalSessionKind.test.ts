import { describe, it, expect } from 'vitest';
import { isManagedProcessSessionId } from '../src/lib/terminalSessionKind';

describe('isManagedProcessSessionId — data-compat with legacy Date.now() ids (audit W1)', () => {
  it('recognizes a legacy Date.now()-suffixed managed-process id (pre-existing on-disk data)', () => {
    // Shape produced by the old `run-${workspaceId}-${cmd.id}-${Date.now()}` generator.
    expect(isManagedProcessSessionId('run-tm4-start-api-1751928400123')).toBe(true);
  });

  it('recognizes a new crypto.randomUUID()-suffixed managed-process id', () => {
    const uuid = crypto.randomUUID();
    expect(isManagedProcessSessionId(`run-tm4-start-api-${uuid}`)).toBe(true);
  });

  it('recognizes the bare legacy regression-run id shape (run-<timestamp>)', () => {
    expect(isManagedProcessSessionId('run-1751928400123')).toBe(true);
  });

  it('rejects a raw interactive-shell session id regardless of id style', () => {
    expect(isManagedProcessSessionId('term-tm4-user-1751928400123')).toBe(false);
    expect(isManagedProcessSessionId(`term-tm4-user-${crypto.randomUUID()}`)).toBe(false);
  });
});
