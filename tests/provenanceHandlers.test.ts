import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerProvenanceHandlers } from '../electron/ipc/provenanceHandlers';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';

// Covers the W5 PR 6 extraction: registerProvenanceHandlers wires the three
// provenance:* channels (all ipcMain.handle) and preserves load/record/seal
// behavior verbatim -- default-empty semantics, descending-timestamp sort,
// checksum sealing, JSON.stringify(..., null, 2) formatting, and error handling.
// fs effects are isolated to a real temp directory (created/removed per test);
// getProvenancePath is a fake bound to that temp file, mirroring how main.ts
// injects the DATA_DIR-bound resolver.

function makeFakeIpcMain() {
  const handlers = new Map<string, { style: 'handle' | 'on'; fn: (...args: any[]) => any }>();
  return {
    handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, { style: 'handle', fn }),
    on: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, { style: 'on', fn }),
    invoke: (channel: string, ...args: any[]) => handlers.get(channel)!.fn(null, ...args),
    styleOf: (channel: string) => handlers.get(channel)?.style,
    channels: () => [...handlers.keys()],
  };
}

let tmpDir: string;
let provPath: string;

function setup(opts: { provPathOverride?: string } = {}) {
  const ipc = makeFakeIpcMain();
  const getProvenancePath = () => opts.provPathOverride ?? provPath;
  registerProvenanceHandlers({ ipcMain: ipc as any, getProvenancePath });
  return { ipc };
}

function readLedger() {
  return JSON.parse(fs.readFileSync(provPath, 'utf-8'));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-test-'));
  // Nest one level so record-mutation's mkdirSync(dirname) path is exercised.
  provPath = path.join(tmpDir, 'governance', 'provenance.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('registerProvenanceHandlers — registration', () => {
  it('registers exactly the three provenance channels, all via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual(['provenance:load-all', 'provenance:record-mutation', 'provenance:seal']);
    for (const ch of ['provenance:load-all', 'provenance:record-mutation', 'provenance:seal']) {
      expect(ipc.styleOf(ch)).toBe('handle');
    }
  });
});

describe('provenance:load-all', () => {
  it('returns [] when no ledger file exists', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('provenance:load-all', { rootPath: null, presetId: 'tm4' })).toEqual([]);
  });

  it('returns [] when the file has no records array', async () => {
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    fs.writeFileSync(provPath, JSON.stringify({ notRecords: true }), 'utf-8');
    const { ipc } = setup();
    expect(await ipc.invoke('provenance:load-all', { rootPath: null, presetId: 'tm4' })).toEqual([]);
  });

  it('returns [] on corrupted JSON (parse error swallowed)', async () => {
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    fs.writeFileSync(provPath, '{ not valid json', 'utf-8');
    const { ipc } = setup();
    expect(await ipc.invoke('provenance:load-all', { rootPath: null, presetId: 'tm4' })).toEqual([]);
  });

  it('parses records, stamps integrityStatus via verifyHash, and sorts descending by timestamp', async () => {
    const older: any = { id: 'a', timestamp: '2026-01-01T00:00:00.000Z' };
    older.hash = computeHash(older);
    const newer: any = { id: 'b', timestamp: '2026-06-01T00:00:00.000Z' };
    newer.hash = computeHash(newer);
    const tampered: any = { id: 'c', timestamp: '2026-03-01T00:00:00.000Z', hash: 'wrong' };
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    fs.writeFileSync(provPath, JSON.stringify({ records: [older, newer, tampered] }), 'utf-8');

    const { ipc } = setup();
    const list = await ipc.invoke('provenance:load-all', { rootPath: null, presetId: 'tm4' });
    expect(list.map((r: any) => r.id)).toEqual(['b', 'c', 'a']); // descending by timestamp
    expect(list.find((r: any) => r.id === 'b').integrityStatus).toBe('verified');
    expect(list.find((r: any) => r.id === 'c').integrityStatus).toBe('tampered');
    expect(list.find((r: any) => r.id === 'a').integrityStatus).toBe('verified');
  });
});

describe('provenance:record-mutation', () => {
  it('creates the ledger dir, hashes + verifies the record, unshifts it, and returns it', async () => {
    const { ipc } = setup();
    const record: any = { id: 'm1', action: 'edit', timestamp: '2026-05-01T00:00:00.000Z' };
    const returned = await ipc.invoke('provenance:record-mutation', { rootPath: null, presetId: 'tm4', record });

    expect(returned.integrityStatus).toBe('verified');
    expect(returned.hash).toBe(computeHash({ id: 'm1', action: 'edit', timestamp: '2026-05-01T00:00:00.000Z' }));
    // Persisted and self-consistent (verifyHash agrees after write).
    const ledger = readLedger();
    expect(ledger.records).toHaveLength(1);
    expect(ledger.records[0].id).toBe('m1');
    expect(verifyHash(ledger.records[0])).toBe('verified');
  });

  it('unshifts onto existing records (newest first) and preserves prior entries', async () => {
    const { ipc } = setup();
    await ipc.invoke('provenance:record-mutation', { rootPath: null, presetId: 'tm4', record: { id: 'first' } });
    await ipc.invoke('provenance:record-mutation', { rootPath: null, presetId: 'tm4', record: { id: 'second' } });
    const ledger = readLedger();
    expect(ledger.records.map((r: any) => r.id)).toEqual(['second', 'first']);
  });

  it('resets to a fresh ledger when the existing file is corrupt, without throwing', async () => {
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    fs.writeFileSync(provPath, '{ corrupt', 'utf-8');
    const { ipc } = setup();
    const returned = await ipc.invoke('provenance:record-mutation', { rootPath: null, presetId: 'tm4', record: { id: 'r' } });
    expect(returned.id).toBe('r');
    expect(readLedger().records.map((r: any) => r.id)).toEqual(['r']);
  });

  it('writes pretty-printed JSON (2-space indent)', async () => {
    const { ipc } = setup();
    await ipc.invoke('provenance:record-mutation', { rootPath: null, presetId: 'tm4', record: { id: 'p' } });
    const raw = fs.readFileSync(provPath, 'utf-8');
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 2));
    expect(raw).toContain('\n  "records"');
  });

  it('rethrows when the write target is unwritable', async () => {
    // provPath points at a location whose parent cannot be created (a file in the way).
    const blocker = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const { ipc } = setup({ provPathOverride: path.join(blocker, 'nested', 'provenance.json') });
    await expect(ipc.invoke('provenance:record-mutation', { rootPath: null, presetId: 'tm4', record: { id: 'x' } }))
      .rejects.toThrow();
  });
});

describe('provenance:seal', () => {
  it('returns failure when no ledger file exists', async () => {
    const { ipc } = setup();
    expect(await ipc.invoke('provenance:seal', { rootPath: null, presetId: 'tm4' }))
      .toEqual({ success: false, error: 'No provenance records found.' });
  });

  it('returns failure when the file has no records array', async () => {
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    fs.writeFileSync(provPath, JSON.stringify({ nope: 1 }), 'utf-8');
    const { ipc } = setup();
    expect(await ipc.invoke('provenance:seal', { rootPath: null, presetId: 'tm4' }))
      .toEqual({ success: false, error: 'No provenance records array found.' });
  });

  it('seals only unhashed records, sets verified status, and reports the count', async () => {
    const alreadyHashed: any = { id: 'h', timestamp: '2026-01-01T00:00:00.000Z' };
    alreadyHashed.hash = computeHash(alreadyHashed);
    const unhashed: any = { id: 'u', timestamp: '2026-02-01T00:00:00.000Z' };
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    fs.writeFileSync(provPath, JSON.stringify({ records: [alreadyHashed, unhashed] }), 'utf-8');

    const { ipc } = setup();
    const result = await ipc.invoke('provenance:seal', { rootPath: null, presetId: 'tm4' });
    expect(result).toEqual({ success: true, sealedCount: 1 });

    const ledger = readLedger();
    const sealed = ledger.records.find((r: any) => r.id === 'u');
    expect(sealed.hash).toBe(computeHash({ id: 'u', timestamp: '2026-02-01T00:00:00.000Z' }));
    expect(sealed.integrityStatus).toBe('verified');
    // Pre-hashed record's hash is unchanged.
    expect(ledger.records.find((r: any) => r.id === 'h').hash).toBe(alreadyHashed.hash);
  });

  it('reports sealedCount 0 and does not rewrite when all records are already hashed', async () => {
    const rec: any = { id: 'h', timestamp: '2026-01-01T00:00:00.000Z' };
    rec.hash = computeHash(rec);
    fs.mkdirSync(path.dirname(provPath), { recursive: true });
    fs.writeFileSync(provPath, JSON.stringify({ records: [rec] }), 'utf-8');
    const mtimeBefore = fs.statSync(provPath).mtimeMs;

    const { ipc } = setup();
    const result = await ipc.invoke('provenance:seal', { rootPath: null, presetId: 'tm4' });
    expect(result).toEqual({ success: true, sealedCount: 0 });
    // No write happened (sealedCount === 0 guards the writeFileSync).
    expect(fs.statSync(provPath).mtimeMs).toBe(mtimeBefore);
  });
});
