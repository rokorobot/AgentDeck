import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

/**
 * Shared Node-side JSON I/O helper (audit W4). electron/main.ts currently has
 * ~30 inline copies of the "check exists -> read -> JSON.parse -> default on
 * error" and "mkdir -> write-to-temp -> rename" patterns. This module is the
 * tested utility layer those sites should eventually adopt -- NOT wired into
 * main.ts in this PR. That adoption is W5 (main-process decomposition) scope,
 * since touching the ~30 call sites is itself the start of that work.
 */

/**
 * Reads and parses a JSON file. Returns `fallback` (a fresh deep copy, never
 * the same reference) if the file is missing, unreadable, or not valid JSON
 * -- callers can safely mutate the returned value without corrupting a
 * reused fallback constant.
 */
export function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return cloneFallback(fallback);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return cloneFallback(fallback);
  }
}

function cloneFallback<T>(fallback: T): T {
  if (fallback === null || typeof fallback !== 'object') return fallback;
  return JSON.parse(JSON.stringify(fallback));
}

/**
 * Writes `data` as pretty-printed JSON, creating parent directories as
 * needed. Uses the write-to-temp-then-rename pattern already used elsewhere
 * in the repo (see electron/main.ts's workspace:save handler) so a reader
 * never observes a partially-written file. Cleans up the temp file if the
 * write or rename fails.
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempPath = `${filePath}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
    throw err;
  }
}
