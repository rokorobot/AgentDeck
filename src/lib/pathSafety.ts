import * as path from 'path';

// Trust-boundary path validation for renderer-supplied workspace paths and ids
// (audit M1.3). Pure and dependency-free so it is unit testable and can be
// reused by any IPC handler. It does NOT touch the filesystem — callers still
// check existence — it only rejects structurally hostile input (traversal,
// relative/empty paths, ids that would escape their directory).

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePathError';
  }
}

/**
 * A workspace root must be a real, absolute path with no parent-traversal
 * segments. Accepts Windows drive paths (C:\...), POSIX absolute (/...), and
 * Windows UNC network shares (\\server\share) — all legitimate places a user
 * may keep a project. Non-throwing; use for defense-in-depth fallbacks.
 */
export function isWorkspaceRootSafe(rootPath: unknown): rootPath is string {
  if (typeof rootPath !== 'string') return false;
  const trimmed = rootPath.trim();
  if (!trimmed || trimmed.includes('\0')) return false;
  if (!path.isAbsolute(trimmed)) return false;
  // Reject any ".." segment on either separator, e.g. C:\a\..\..\Windows.
  if (trimmed.split(/[\\/]+/).some((seg) => seg === '..')) return false;
  return true;
}

/**
 * Validate and normalize a workspace root, throwing an actionable
 * WorkspacePathError if it is empty, relative, or contains traversal segments.
 */
export function normalizeWorkspaceRootPath(rootPath: unknown): string {
  if (!isWorkspaceRootSafe(rootPath)) {
    throw new WorkspacePathError(
      'Invalid workspace folder. Select an existing absolute folder (no relative, empty, or ".." paths).'
    );
  }
  return path.normalize((rootPath as string).trim());
}

/** Alias matching the audit task's suggested name. */
export const assertSafeWorkspaceRoot = normalizeWorkspaceRootPath;

/**
 * Validate a renderer-supplied identifier that will be interpolated into a
 * filename (snapshotId, depId, failureId, ...). Rejects anything that could
 * escape its directory: path separators, "..", drive/wildcard characters, and
 * NUL. Returns the trimmed id. Throws WorkspacePathError otherwise.
 */
export function assertSafeId(value: unknown, label = 'identifier'): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WorkspacePathError(`Missing or invalid ${label}.`);
  }
  const v = value.trim();
  if (v === '.' || v === '..' || v.includes('..') || /[\\/\0:*?"<>|]/.test(v)) {
    throw new WorkspacePathError(
      `Unsafe ${label}: "${value}". IDs cannot contain path separators, "..", or drive/wildcard characters.`
    );
  }
  return v;
}

/** True iff `candidate` resolves to `root` itself or a location inside it. */
export function isPathInside(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Assert that `candidate` stays within `root`, returning the resolved candidate.
 * Throws WorkspacePathError if it escapes.
 */
export function assertPathInsideWorkspace(candidate: string, root: string): string {
  const resolved = path.resolve(candidate);
  if (!isPathInside(root, resolved)) {
    throw new WorkspacePathError(`Path "${candidate}" escapes the workspace root "${root}".`);
  }
  return resolved;
}
