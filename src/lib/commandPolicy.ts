// Shared, PURE command-safety policy (audit W2). No Node-only imports, so it
// bundles safely in BOTH the Electron main process (backend enforcement, via
// electron/commandSafety.ts) and the renderer (frontend pre-flight warning,
// via src/lib/commandSafety.ts).
//
// Why shared: the dangerous-command classification used to be duplicated in
// both files. If the two lists drift, a command the UI passes but the backend
// blocks gets hard-blocked at the PTY with no approval dialog. Housing the
// classification here keeps them identical by construction. The backend
// remains authoritative and layers its own Node path.relative-based traversal
// enforcement on top of this (see electron/commandSafety.ts:isPathSafe).

export interface DangerousRule {
  /** Stable identifier for diagnostics and tests. */
  id: string;
  pattern: RegExp;
}

// Each pattern targets destructive/exfiltration intent while avoiding common
// benign false positives. The narrowing on rm / format / ssh / scp is the W2
// de-noise work; del / rmdir / shutdown / git reset --hard / git clean are
// kept strict as-is.
export const DANGEROUS_RULES: DangerousRule[] = [
  // Filesystem deletion. The negative lookbehind excludes ONLY the package-
  // manager uninstall aliases (`npm|pnpm|bun rm <pkg>`), which are package
  // operations, not filesystem deletes. Every other context still matches:
  // bare `rm`, `rm -rf /`, `x && rm -rf dist`, `find . | xargs rm`, and even
  // `npm rm; rm -rf /` (the second, non-alias rm still triggers).
  { id: 'rm', pattern: /(?<!\b(?:npm|pnpm|bun)\s+)\brm\b/i },
  { id: 'del', pattern: /\bdel\b/i },
  { id: 'rmdir', pattern: /\brmdir\b/i },
  // Windows disk format. Requires a drive-letter target (`format C:`), so it
  // no longer flags `npm run format`, `git log --format=%H`, or `--format`.
  { id: 'format', pattern: /\bformat\s+[a-zA-Z]:/i },
  { id: 'git-reset-hard', pattern: /\bgit\s+reset\s+--hard\b/i },
  { id: 'git-clean', pattern: /\bgit\s+clean\b/i },
  { id: 'shutdown', pattern: /\bshutdown\b/i },
  // Remote transfer / connection. Anchored to command position (line start or
  // after a shell operator) and requiring a following argument, so benign
  // `.ssh` path access (`cat ~/.ssh/config`, `chmod 600 ~/.ssh/id_rsa`) and
  // local key tools (`ssh-keygen`, `ssh-add`, `ssh-agent`) no longer trigger,
  // while `ssh user@host`, `deploy && ssh prod`, and `scp file host:` still do.
  { id: 'scp', pattern: /(?:^|[;&|]\s*)scp\s+\S/i },
  { id: 'ssh', pattern: /(?:^|[;&|]\s*)ssh\s+\S/i },
];

export interface DangerousMatch {
  ruleId: string;
}

/**
 * Returns the first dangerous rule the command matches, or null if none.
 * Pure and side-effect free.
 */
export function findDangerousMatch(command: string): DangerousMatch | null {
  const trimmed = command.trim();
  if (!trimmed) return null;
  for (const rule of DANGEROUS_RULES) {
    if (rule.pattern.test(trimmed)) {
      return { ruleId: rule.id };
    }
  }
  return null;
}

/**
 * Pure, renderer-safe heuristic predicting whether a command references paths
 * outside the workspace. This is a UI pre-flight APPROXIMATION only — the
 * backend's Node path.relative-based isPathSafe is the authoritative check.
 * Behavior is preserved verbatim from the previous inline frontend logic.
 */
export function looksLikePathEscape(command: string, workspacePath: string): boolean {
  const cmd = command.trim();
  if (!cmd || !workspacePath) return false;
  if (cmd.includes('..')) return true;
  if (/:[\\/]/.test(cmd) && !cmd.toLowerCase().includes(workspacePath.toLowerCase().replace(/\\/g, '/'))) {
    return true;
  }
  return false;
}
