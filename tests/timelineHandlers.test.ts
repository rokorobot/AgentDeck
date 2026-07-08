import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerTimelineHandlers } from '../electron/ipc/timelineHandlers';
import { computeHash, verifyHash } from '../src/lib/integrityChecksum';

// Covers the W5 PR 8 extraction: registerTimelineHandlers wires the two
// timeline:* channels (all ipcMain.handle) and preserves load/save behavior
// verbatim -- preset auto-seeding, per-event files, verifyHash stamping,
// descending-timestamp sort, computeHash sealing, JSON.stringify(..., null, 2)
// formatting, assertSafeId filename sanitization, and error handling. fs effects
// are isolated to a real temp dir; getTimelineDir is faked to point there.

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
let timelineDir: string;

function setup(opts: { dirOverride?: string } = {}) {
  const ipc = makeFakeIpcMain();
  const getTimelineDir = () => opts.dirOverride ?? timelineDir;
  registerTimelineHandlers({ ipcMain: ipc as any, getTimelineDir });
  return { ipc };
}

const eventFile = (id: string) => path.join(timelineDir, `event-${id}.json`);
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf-8'));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-test-'));
  // Nested so the handlers' mkdirSync(timelineDir, {recursive}) branch is exercised.
  timelineDir = path.join(tmpDir, 'ws', 'timeline');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('registerTimelineHandlers — registration', () => {
  it('registers exactly the two timeline channels, both via ipcMain.handle', () => {
    const { ipc } = setup();
    expect(ipc.channels().sort()).toEqual(['timeline:load-events', 'timeline:save-event']);
    expect(ipc.styleOf('timeline:load-events')).toBe('handle');
    expect(ipc.styleOf('timeline:save-event')).toBe('handle');
  });
});

describe('timeline:load-events — preset auto-seeding', () => {
  it('sound-machina seeds 4 events, persists per-event files, returns them newest-first & verified', async () => {
    const { ipc } = setup();
    const events = await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'sound-machina' });

    // Descending by timestamp: sm-4 (30m) > sm-3 (1h) > sm-2 (1.5h) > sm-1 (2h).
    expect(events.map((e: any) => e.id)).toEqual(['seed-sm-4', 'seed-sm-3', 'seed-sm-2', 'seed-sm-1']);
    for (const e of events) {
      expect(e.isSeeded).toBe(true);
      expect(e.integrityStatus).toBe('verified');
      expect(typeof e.hash).toBe('string');
    }
    // Four per-event files persisted, each self-consistent.
    for (const id of ['seed-sm-1', 'seed-sm-2', 'seed-sm-3', 'seed-sm-4']) {
      expect(fs.existsSync(eventFile(id))).toBe(true);
      expect(verifyHash(readJson(eventFile(id)))).toBe('verified');
    }
  });

  it('tm4 seeds 2 events (tm-2 newer than tm-1)', async () => {
    const { ipc } = setup();
    const events = await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'tm4' });
    expect(events.map((e: any) => e.id)).toEqual(['seed-tm-2', 'seed-tm-1']);
    expect(events[0].type).toBe('regression_executed');
  });

  it('robotstore seeds a single event', async () => {
    const { ipc } = setup();
    const events = await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'robotstore' });
    expect(events.map((e: any) => e.id)).toEqual(['seed-rs-1']);
  });

  it('non-preset does NOT seed and returns [] (no files written)', async () => {
    const { ipc } = setup();
    const events = await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'custom-xyz' });
    expect(events).toEqual([]);
    expect(fs.readdirSync(timelineDir)).toEqual([]);
  });

  it('seeded event files are pretty-printed (2-space indent)', async () => {
    const { ipc } = setup();
    await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'robotstore' });
    const raw = fs.readFileSync(eventFile('seed-rs-1'), 'utf-8');
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 2));
  });
});

describe('timeline:load-events — loading existing events', () => {
  function writeEvent(id: string, timestamp: string, mutateAfterHash?: (e: any) => void) {
    fs.mkdirSync(timelineDir, { recursive: true });
    const ev: any = { id, timestamp, type: 'custom' };
    ev.hash = computeHash(ev);
    if (mutateAfterHash) mutateAfterHash(ev);
    fs.writeFileSync(eventFile(id), JSON.stringify(ev), 'utf-8');
  }

  it('parses events, stamps integrityStatus via verifyHash, sorts descending, does not reseed', async () => {
    writeEvent('e-old', '2026-01-01T00:00:00.000Z');
    writeEvent('e-new', '2026-06-01T00:00:00.000Z');
    writeEvent('e-bad', '2026-03-01T00:00:00.000Z', (e) => { e.type = 'mutated'; }); // tamper post-hash

    const { ipc } = setup();
    const events = await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'tm4' });
    // Non-empty dir -> no seeding; sorted descending by timestamp.
    expect(events.map((e: any) => e.id)).toEqual(['e-new', 'e-bad', 'e-old']);
    expect(events.find((e: any) => e.id === 'e-new').integrityStatus).toBe('verified');
    expect(events.find((e: any) => e.id === 'e-old').integrityStatus).toBe('verified');
    expect(events.find((e: any) => e.id === 'e-bad').integrityStatus).toBe('tampered');
  });

  it('skips a corrupt event file but returns the valid ones', async () => {
    writeEvent('e-good', '2026-02-01T00:00:00.000Z');
    fs.writeFileSync(eventFile('e-corrupt'), '{ not json', 'utf-8');
    const { ipc } = setup();
    const events = await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'tm4' });
    expect(events.map((e: any) => e.id)).toEqual(['e-good']);
  });

  it('ignores non-.json files in the directory', async () => {
    writeEvent('e-1', '2026-02-01T00:00:00.000Z');
    fs.writeFileSync(path.join(timelineDir, 'notes.txt'), 'ignore me', 'utf-8');
    const { ipc } = setup();
    const events = await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'tm4' });
    expect(events.map((e: any) => e.id)).toEqual(['e-1']);
  });

  it('returns [] when the timeline dir path is unusable', async () => {
    const blocker = path.join(tmpDir, 'blk');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const { ipc } = setup({ dirOverride: path.join(blocker, 'timeline') });
    expect(await ipc.invoke('timeline:load-events', { rootPath: null, presetId: 'tm4' })).toEqual([]);
  });
});

describe('timeline:save-event', () => {
  it('hashes and writes event-<id>.json (2-space), returns true, creating the dir', async () => {
    const { ipc } = setup();
    const event: any = { id: 'evt-1', type: 'service_started', timestamp: '2026-05-01T00:00:00.000Z' };
    const ok = await ipc.invoke('timeline:save-event', { rootPath: null, presetId: 'tm4', event });
    expect(ok).toBe(true);

    const saved = readJson(eventFile('evt-1'));
    expect(saved.hash).toBe(computeHash({ id: 'evt-1', type: 'service_started', timestamp: '2026-05-01T00:00:00.000Z' }));
    expect(verifyHash(saved)).toBe('verified');
    const raw = fs.readFileSync(eventFile('evt-1'), 'utf-8');
    expect(raw).toBe(JSON.stringify(saved, null, 2));
  });

  it('returns false for an unsafe event id (assertSafeId rejects path separators)', async () => {
    const { ipc } = setup();
    const ok = await ipc.invoke('timeline:save-event', { rootPath: null, presetId: 'tm4', event: { id: '../evil' } });
    expect(ok).toBe(false);
    // Nothing traversal-y was written.
    expect(fs.existsSync(path.join(tmpDir, 'evil.json'))).toBe(false);
  });

  it('returns false when the write target is unusable', async () => {
    const blocker = path.join(tmpDir, 'blk2');
    fs.writeFileSync(blocker, 'x', 'utf-8');
    const { ipc } = setup({ dirOverride: path.join(blocker, 'timeline') });
    const ok = await ipc.invoke('timeline:save-event', { rootPath: null, presetId: 'tm4', event: { id: 'e' } });
    expect(ok).toBe(false);
  });
});
