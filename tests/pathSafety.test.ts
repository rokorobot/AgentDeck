import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  isWorkspaceRootSafe,
  normalizeWorkspaceRootPath,
  assertSafeId,
  isPathInside,
  assertPathInsideWorkspace,
  WorkspacePathError,
} from '../src/lib/pathSafety';

describe('isWorkspaceRootSafe', () => {
  it('accepts a normal Windows absolute path', () => {
    expect(isWorkspaceRootSafe('C:\\Users\\dev\\project')).toBe(true);
  });

  it('accepts a POSIX absolute path', () => {
    expect(isWorkspaceRootSafe('/home/dev/project')).toBe(true);
  });

  it('accepts a Windows UNC network share', () => {
    expect(isWorkspaceRootSafe('\\\\server\\share\\project')).toBe(true);
  });

  it('rejects empty, whitespace, and non-strings', () => {
    expect(isWorkspaceRootSafe('')).toBe(false);
    expect(isWorkspaceRootSafe('   ')).toBe(false);
    expect(isWorkspaceRootSafe(null)).toBe(false);
    expect(isWorkspaceRootSafe(undefined)).toBe(false);
    expect(isWorkspaceRootSafe(42)).toBe(false);
  });

  it('rejects relative paths where absolute is required', () => {
    expect(isWorkspaceRootSafe('project')).toBe(false);
    expect(isWorkspaceRootSafe('.\\project')).toBe(false);
    expect(isWorkspaceRootSafe('../project')).toBe(false);
  });

  it('rejects absolute paths containing a traversal segment', () => {
    expect(isWorkspaceRootSafe('C:\\Users\\dev\\..\\..\\Windows')).toBe(false);
    expect(isWorkspaceRootSafe('/home/dev/../../etc')).toBe(false);
  });

  it('rejects paths with a NUL byte', () => {
    expect(isWorkspaceRootSafe('C:\\Users\\dev\\proj\0')).toBe(false);
  });
});

describe('normalizeWorkspaceRootPath', () => {
  it('returns a normalized path for a valid root', () => {
    expect(normalizeWorkspaceRootPath('C:\\Users\\dev\\project')).toBe(path.normalize('C:\\Users\\dev\\project'));
  });

  it('throws an actionable WorkspacePathError on a hostile root', () => {
    expect(() => normalizeWorkspaceRootPath('../../etc')).toThrow(WorkspacePathError);
    expect(() => normalizeWorkspaceRootPath('')).toThrow(/Invalid workspace folder/i);
  });

  it('treats a path with shell metacharacters as literal text, not shell syntax', () => {
    // An absolute path that merely contains shell metacharacters is still a
    // valid path string — validation must not choke on it or execute anything.
    const p = 'C:\\Users\\dev\\proj & calc';
    expect(isWorkspaceRootSafe(p)).toBe(true);
    expect(normalizeWorkspaceRootPath(p)).toBe(path.normalize(p));
  });
});

describe('assertSafeId', () => {
  it('accepts ordinary generated ids', () => {
    expect(assertSafeId('snapshot-1720000000000')).toBe('snapshot-1720000000000');
    expect(assertSafeId('dep_abc-123')).toBe('dep_abc-123');
  });

  it('rejects path separators', () => {
    expect(() => assertSafeId('../../secret', 'snapshotId')).toThrow(WorkspacePathError);
    expect(() => assertSafeId('a\\b', 'snapshotId')).toThrow(/Unsafe snapshotId/);
    expect(() => assertSafeId('a/b', 'snapshotId')).toThrow(/Unsafe snapshotId/);
  });

  it('rejects traversal, drive letters, wildcards, and NUL', () => {
    expect(() => assertSafeId('..')).toThrow();
    expect(() => assertSafeId('C:evil')).toThrow();
    expect(() => assertSafeId('a*b')).toThrow();
    expect(() => assertSafeId('a\0b')).toThrow();
  });

  it('rejects empty / non-string ids with a missing-id message', () => {
    expect(() => assertSafeId('', 'depId')).toThrow(/Missing or invalid depId/);
    expect(() => assertSafeId(undefined, 'depId')).toThrow(/Missing or invalid depId/);
  });
});

describe('isPathInside / assertPathInsideWorkspace', () => {
  const root = path.resolve('C:\\Users\\dev\\project');

  it('accepts the root itself and legitimate children', () => {
    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(root, path.join(root, '.agentdeck', 'snapshots'))).toBe(true);
  });

  it('rejects a child that escapes via traversal', () => {
    expect(isPathInside(root, path.join(root, '..', '..', 'Windows'))).toBe(false);
  });

  it('assertPathInsideWorkspace returns the resolved child or throws on escape', () => {
    const child = path.join(root, '.agentdeck', 'snapshots');
    expect(assertPathInsideWorkspace(child, root)).toBe(path.resolve(child));
    expect(() => assertPathInsideWorkspace(path.join(root, '..', 'other'), root)).toThrow(WorkspacePathError);
  });
});
