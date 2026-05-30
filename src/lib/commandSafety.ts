// Dangerous command matches in frontend
const DANGEROUS_PATTERNS = [
  /\brm\b/i,
  /\bdel\b/i,
  /\brmdir\b/i,
  /\bformat\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
  /\bshutdown\b/i,
  /\bscp\b/i,
  /\bssh\b/i,
];

/**
 * Checks if a command needs confirmation on the frontend.
 */
export function checkCommandSafety(command: string, workspacePath: string): {
  safe: boolean;
  reason?: string;
} {
  const cmd = command.trim();
  if (!cmd) return { safe: true };

  // Check dangerous patterns
  const matchesDangerous = DANGEROUS_PATTERNS.some((pattern) => pattern.test(cmd));
  if (matchesDangerous) {
    return {
      safe: false,
      reason: `The command "${cmd}" contains potentially destructive operations.`
    };
  }

  // Check path escapes
  // Simple check for relative parent traversal ".." or absolute paths referencing other letters if we can detect them
  if (cmd.includes('..') || (/:[\\/]/.test(cmd) && !cmd.toLowerCase().includes(workspacePath.toLowerCase().replace(/\\/g, '/')))) {
    // If it mentions drive letters or relative parents, suggest confirmation
    return {
      safe: false,
      reason: `The command may access files outside the current workspace path: "${workspacePath}".`
    };
  }

  return { safe: true };
}
