import { findDangerousMatch, looksLikePathEscape } from './commandPolicy';

// Frontend pre-flight warning path. Delegates the dangerous-command
// classification and the path-escape heuristic to the shared, pure
// commandPolicy module so it can never drift from the backend enforcement
// path (electron/commandSafety.ts). This is UX only — the backend
// validateCommand is the authoritative gate.

/**
 * Checks if a command needs confirmation on the frontend.
 */
export function checkCommandSafety(command: string, workspacePath: string): {
  safe: boolean;
  reason?: string;
} {
  const cmd = command.trim();
  if (!cmd) return { safe: true };

  if (findDangerousMatch(cmd)) {
    return {
      safe: false,
      reason: `The command "${cmd}" contains potentially destructive operations.`
    };
  }

  if (looksLikePathEscape(cmd, workspacePath)) {
    return {
      safe: false,
      reason: `The command may access files outside the current workspace path: "${workspacePath}".`
    };
  }

  return { safe: true };
}
