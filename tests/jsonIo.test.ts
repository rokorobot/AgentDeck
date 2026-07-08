import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readJsonSafe, writeJsonAtomic } from '../src/lib/jsonIo';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-jsonio-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('readJsonSafe', () => {
  it('returns parsed JSON for a valid file', () => {
    const filePath = path.join(tempDir, 'data.json');
    fs.writeFileSync(filePath, JSON.stringify({ a: 1, b: [1, 2, 3] }));
    expect(readJsonSafe(filePath, {})).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('returns the fallback for a missing file', () => {
    const filePath = path.join(tempDir, 'missing.json');
    expect(readJsonSafe(filePath, { records: [] })).toEqual({ records: [] });
  });

  it('returns the fallback for malformed JSON', () => {
    const filePath = path.join(tempDir, 'bad.json');
    fs.writeFileSync(filePath, '{ not valid json');
    expect(readJsonSafe(filePath, { records: [] })).toEqual({ records: [] });
  });

  it('returns the fallback for an empty (0-byte) file', () => {
    const filePath = path.join(tempDir, 'empty.json');
    fs.writeFileSync(filePath, '');
    expect(readJsonSafe(filePath, [] as any[])).toEqual([]);
  });

  it('does not mutate the fallback object -- returns an independent copy', () => {
    const filePath = path.join(tempDir, 'missing.json');
    const sharedFallback = { records: [] as string[] };

    const first = readJsonSafe(filePath, sharedFallback);
    first.records.push('mutated-by-caller');

    // The original fallback constant must be unaffected by mutating what was returned.
    expect(sharedFallback.records).toEqual([]);

    // A second call with the same shared fallback must also come back clean.
    const second = readJsonSafe(filePath, sharedFallback);
    expect(second.records).toEqual([]);
  });

  it('passes primitive fallbacks through unchanged', () => {
    expect(readJsonSafe(path.join(tempDir, 'missing.json'), 42)).toBe(42);
    expect(readJsonSafe(path.join(tempDir, 'missing.json'), null)).toBe(null);
  });
});

describe('writeJsonAtomic', () => {
  it('writes pretty-printed JSON that round-trips through readJsonSafe', () => {
    const filePath = path.join(tempDir, 'out.json');
    const payload = { id: 'x', nested: { value: 1 }, list: [1, 2, 3] };

    writeJsonAtomic(filePath, payload);

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toContain('\n'); // pretty-printed, not minified
    expect(readJsonSafe(filePath, null)).toEqual(payload);
  });

  it('creates missing parent directories', () => {
    const filePath = path.join(tempDir, 'nested', 'deep', 'out.json');
    expect(fs.existsSync(path.dirname(filePath))).toBe(false);

    writeJsonAtomic(filePath, { ok: true });

    expect(fs.existsSync(filePath)).toBe(true);
    expect(readJsonSafe(filePath, null)).toEqual({ ok: true });
  });

  it('leaves no temp file behind after a successful write', () => {
    const filePath = path.join(tempDir, 'out.json');
    writeJsonAtomic(filePath, { ok: true });

    const leftover = fs.readdirSync(tempDir).filter((f) => f.includes('.tmp-'));
    expect(leftover).toEqual([]);
  });

  it('overwrites an existing file atomically (old content never partially visible)', () => {
    const filePath = path.join(tempDir, 'out.json');
    writeJsonAtomic(filePath, { version: 1 });
    writeJsonAtomic(filePath, { version: 2 });

    expect(readJsonSafe(filePath, null)).toEqual({ version: 2 });
    const leftover = fs.readdirSync(tempDir).filter((f) => f.includes('.tmp-'));
    expect(leftover).toEqual([]);
  });
});
