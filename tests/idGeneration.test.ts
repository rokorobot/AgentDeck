import { describe, it, expect } from 'vitest';

// Audit W1: the old `${prefix}-${Date.now()}` ID generators could produce the
// exact same id when called twice within the same millisecond (confirmed
// reproducible in a tight loop). crypto.randomUUID() replaces Date.now() as
// the uniqueness source across every generator site in the app; this proves
// the underlying primitive those generators now rely on is collision-safe.
describe('crypto.randomUUID() — collision safety under rapid generation', () => {
  it('produces no duplicate values across 10,000 back-to-back calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(crypto.randomUUID());
    }
    expect(ids.size).toBe(10_000);
  });

  it('demonstrates the old Date.now()-only approach WOULD collide in a tight loop', () => {
    // Documents the exact defect being fixed: two "generations" in the same
    // millisecond produce the same value with Date.now() alone.
    const legacyIds = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      legacyIds.add(`fail-${Date.now()}`);
    }
    // This is the bug -- far fewer unique ids than iterations.
    expect(legacyIds.size).toBeLessThan(1000);
  });
});
