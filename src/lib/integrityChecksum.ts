import crypto from 'crypto';

// INTEGRITY MODEL (audit QW2): the "integrity" fields produced here are an
// UNKEYED, deterministic SHA-256 checksum stored alongside the object. This
// detects accidental corruption and casual manual edits — it is NOT a digital
// signature and provides NO tamper resistance against anyone who can recompute
// the hash after editing (there is no secret key or asymmetric keypair). Do not
// present these as "cryptographic seals" or "signatures" in user-facing text.
// TODO(M1.2 / signing): once the threat model is decided, replace with real
// signing — HMAC-SHA256 keyed by a per-install secret (Electron safeStorage /
// OS keychain) for local-tamper resistance, or an asymmetric keypair for
// shareable / team-verifiable governance artifacts.
//
// Canonical home for the integrity checksum (W5 PR 5). Previously duplicated
// inline in electron/main.ts (computeHash/verifyHash) and in
// src/lib/depRiskEngine.ts (computeDeterministicHash/verifyIntegrityHash) with
// identical semantics; those now re-export from here. Pure — depends only on
// node `crypto`, so it is reusable from both the Electron main process and
// src/lib without any circular import.

// Compute a deterministic SHA-256 integrity checksum of an object. Keys are
// recursively sorted and the integrity bookkeeping fields (hash /
// integrityStatus / tampered) are excluded so the checksum is stable regardless
// of key order and independent of a previously-stored hash.
export function computeHash(obj: any): string {
  if (obj === null || obj === undefined) return '';

  // Deterministic recursive key sorting and excluding hash keys
  const sortObject = (o: any): any => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sortObject);
    return Object.keys(o).sort().reduce((acc: any, key: string) => {
      if (key === 'hash' || key === 'integrityStatus' || key === 'tampered') {
        return acc;
      }
      acc[key] = sortObject(o[key]);
      return acc;
    }, {});
  };

  const serialized = JSON.stringify(sortObject(obj));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

// Verify hash integrity of an object: 'unsigned' when no hash is present,
// 'verified' when the stored hash matches the recomputed value, 'tampered'
// otherwise. Accepts the hash at obj.hash or obj.manifest.hash.
export function verifyHash(obj: any): 'verified' | 'unsigned' | 'tampered' {
  if (!obj || typeof obj !== 'object') return 'unsigned';

  const hash = obj.hash || (obj.manifest && obj.manifest.hash);
  if (!hash) return 'unsigned';

  const recomputed = computeHash(obj);
  return hash === recomputed ? 'verified' : 'tampered';
}
