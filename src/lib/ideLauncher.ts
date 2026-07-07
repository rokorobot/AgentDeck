import * as path from 'path';

// Pure helpers for launching external editors safely.
//
// Security intent (audit QW1 / main.ts:476-503): the renderer-supplied
// folderPath must never be interpolated into a shell command string. These
// helpers only ever return an executable plus an ARGUMENT ARRAY, so the caller
// can spawn with `shell: false` and the path stays a single literal argv entry.

export interface IdeLaunchSpec {
  /** Logical command name resolved on PATH (e.g. "code"). Never a shell string. */
  command: string;
  /** Arguments passed verbatim as argv — always exactly [folderPath]. */
  args: string[];
  /** On Windows the PATH entry is a `.cmd` shim that cannot be spawned without a
   *  shell; this is the real image to launch instead, found near the shim. */
  windowsExeName?: string;
}

/**
 * Map a supported editor id to a launch spec. Returns null for anything that is
 * not spawned as a child process (folder open, mock targets, unknown ids) so the
 * caller handles those explicitly.
 */
export function buildIdeOpenCommand(ide: string, folderPath: string): IdeLaunchSpec | null {
  switch (ide) {
    case 'vscode':
      return { command: 'code', args: [folderPath], windowsExeName: 'Code.exe' };
    case 'cursor':
      return { command: 'cursor', args: [folderPath], windowsExeName: 'Cursor.exe' };
    default:
      return null;
  }
}

/**
 * Find an executable by searching each PATH directory against each PATHEXT
 * extension. Pure: filesystem and environment access are injected so it is unit
 * testable. Returns the first existing candidate, or null.
 */
export function resolveExecutableOnPath(
  command: string,
  opts: {
    pathValue: string;
    pathext: string;
    fileExists: (candidate: string) => boolean;
    delimiter?: string;
  }
): string | null {
  const dirs = (opts.pathValue || '').split(opts.delimiter ?? path.delimiter).filter(Boolean);
  const exts = ['', ...(opts.pathext || '').split(';').filter(Boolean)];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (opts.fileExists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Given a resolved shim path (e.g. ...\bin\code.cmd), walk upward looking for the
 * real editor image (e.g. Code.exe) which can be spawned directly with no shell.
 * Pure: `fileExists` is injected. Returns the exe path, or null if not found
 * within maxDepth levels.
 */
export function findEditorExecutable(
  shimPath: string,
  exeName: string,
  fileExists: (candidate: string) => boolean,
  maxDepth = 5
): string | null {
  let dir = path.dirname(shimPath);
  for (let depth = 0; depth <= maxDepth; depth++) {
    const candidate = path.join(dir, exeName);
    if (fileExists(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
