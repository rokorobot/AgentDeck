import { describe, it, expect } from 'vitest';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';
import { computeDeterministicHash, verifyIntegrityHash } from '../src/lib/depRiskEngine';

// W5 PR 5 foundation: integrityChecksum.ts is the canonical home for the
// deterministic SHA-256 integrity checksum previously duplicated inline in
// electron/main.ts (computeHash/verifyHash) and src/lib/depRiskEngine.ts
// (computeDeterministicHash/verifyIntegrityHash). These tests pin the exact
// semantics -- including golden digests captured from the ORIGINAL inline
// main.ts implementation -- so any drift fails loudly.

// Golden values produced by the original inline main.ts computeHash (captured
// before extraction). Extraction must reproduce these byte-for-byte.
const GOLDEN = {
  ab: '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
  nestedExcluded: 'ce1e64ead061b53233415a1425aaa15c57267e8a697a7f2f88cec71e7377eae2',
  string: '69a35681d46c434bb666f849e810ab79aece20eb130665d6fdf0d9b433c8b842',
  number: '73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049',
};

describe('computeHash', () => {
  it('reproduces the golden digest of the original inline implementation', () => {
    expect(computeHash({ a: 1, b: 2 })).toBe(GOLDEN.ab);
    expect(computeHash('plain-string')).toBe(GOLDEN.string);
    expect(computeHash(42)).toBe(GOLDEN.number);
  });

  it('is deterministic regardless of key order (recursive sort)', () => {
    expect(computeHash({ a: 1, b: 2 })).toBe(computeHash({ b: 2, a: 1 }));
    expect(computeHash({ x: { p: 1, q: 2 } })).toBe(computeHash({ x: { q: 2, p: 1 } }));
  });

  it('excludes hash/integrityStatus/tampered keys at every depth, matching the golden digest', () => {
    const withMeta = { id: 'x', nested: { z: 1, a: [3, 2, 1] }, hash: 'IGNORED', integrityStatus: 'verified', tampered: true };
    const withoutMeta = { id: 'x', nested: { z: 1, a: [3, 2, 1] } };
    expect(computeHash(withMeta)).toBe(GOLDEN.nestedExcluded);
    expect(computeHash(withMeta)).toBe(computeHash(withoutMeta));
  });

  it('changes when meaningful content changes', () => {
    const base = { a: 1, b: 2 };
    expect(computeHash({ ...base, b: 3 })).not.toBe(computeHash(base));
    expect(computeHash({ a: 1, b: 2, c: 3 })).not.toBe(computeHash(base));
  });

  it('preserves array order (arrays are not sorted)', () => {
    expect(computeHash({ a: [1, 2, 3] })).not.toBe(computeHash({ a: [3, 2, 1] }));
  });

  it('returns "" for null and undefined', () => {
    expect(computeHash(null)).toBe('');
    expect(computeHash(undefined)).toBe('');
  });
});

describe('verifyHash', () => {
  it('returns "unsigned" for non-objects or objects without a hash', () => {
    expect(verifyHash(null)).toBe('unsigned');
    expect(verifyHash('str')).toBe('unsigned');
    expect(verifyHash(42)).toBe('unsigned');
    expect(verifyHash({ id: 'x' })).toBe('unsigned');
  });

  it('returns "verified" when the stored hash matches the recomputed value', () => {
    const record: any = { id: 'r1', payload: { k: 'v' } };
    record.hash = computeHash(record);
    expect(verifyHash(record)).toBe('verified');
  });

  it('returns "tampered" when content changed after the hash was stored', () => {
    const record: any = { id: 'r1', payload: { k: 'v' } };
    record.hash = computeHash(record);
    record.payload.k = 'mutated';
    expect(verifyHash(record)).toBe('tampered');
  });

  it('reads the hash from obj.manifest.hash as a fallback', () => {
    const snap: any = { manifest: { data: 1 } };
    snap.manifest.hash = computeHash(snap);
    expect(verifyHash(snap)).toBe('verified');
    snap.manifest.data = 2;
    expect(verifyHash(snap)).toBe('tampered');
  });
});

describe('depRiskEngine re-exports are the same canonical functions', () => {
  it('computeDeterministicHash === computeHash (identity, not just equal output)', () => {
    expect(computeDeterministicHash).toBe(computeHash);
    expect(verifyIntegrityHash).toBe(verifyHash);
  });

  it('produces identical digests across both entry points', () => {
    const obj = { deep: { b: 2, a: 1 }, list: [1, 2] };
    expect(computeDeterministicHash(obj)).toBe(computeHash(obj));
  });
});
