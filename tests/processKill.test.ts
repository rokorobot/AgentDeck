import { describe, it, expect } from 'vitest';
import { buildTaskkillArgs } from '../src/lib/processKill';

describe('buildTaskkillArgs', () => {
  it('builds a force + tree kill argv with the PID as a literal argument', () => {
    expect(buildTaskkillArgs(1234)).toEqual(['/F', '/T', '/PID', '1234']);
  });

  it('stringifies the PID so it is passed as one argv element, never shell syntax', () => {
    const args = buildTaskkillArgs(4242);
    expect(args).toHaveLength(4);
    expect(args[3]).toBe('4242');
    // No element fuses flags with the PID or contains shell metacharacters.
    expect(args.join(' ')).not.toMatch(/[&|;$`]/);
  });
});
