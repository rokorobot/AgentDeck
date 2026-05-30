import path from 'path';

// Dangerous command matches
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

// Memory storage of pre-approved commands for the current session
const approvedCommands = new Set<string>();

/**
 * Checks if a command string is dangerous based on keyword patterns.
 */
export function isCommandDangerous(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Checks if a command refers to absolute paths or relative parent paths outside the approved workspace path.
 */
export function isPathSafe(command: string, workspacePath: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || !workspacePath) return true;

  // Search for paths in the command
  // Match absolute Windows paths (e.g. C:\...) or Unix-style paths (e.g. /etc) or relative parental navigations (..)
  const pathRegex = /(?:[a-zA-Z]:[\\/][^:\s]+)|(?:\.\.[\\/][^:\s]+)|(?:\/[a-zA-Z_0-9]+[\\/][^:\s]+)/g;
  let match;
  
  while ((match = pathRegex.exec(trimmed)) !== null) {
    const matchedPath = match[0];
    const absolutePath = path.isAbsolute(matchedPath)
      ? path.normalize(matchedPath)
      : path.normalize(path.join(workspacePath, matchedPath));

    const relative = path.relative(workspacePath, absolutePath);
    // If the path navigates up from the workspace directory, it's unsafe
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return false;
    }
  }

  return true;
}

/**
 * Registers a command as pre-approved (e.g. after user clicks Confirm in the dialog)
 */
export function approveCommand(command: string): void {
  approvedCommands.add(command.trim());
  // Auto-expire after 5 seconds to prevent accidental reuse
  setTimeout(() => {
    approvedCommands.delete(command.trim());
  }, 5000);
}

/**
 * Verifies if a command has been pre-approved
 */
export function isCommandApproved(command: string): boolean {
  return approvedCommands.has(command.trim());
}

/**
 * Performs full validation and returns check results
 */
export function validateCommand(command: string, workspacePath: string): {
  safe: boolean;
  reason?: string;
} {
  const cmd = command.trim();
  
  if (isCommandApproved(cmd)) {
    return { safe: true };
  }

  if (isCommandDangerous(cmd)) {
    return {
      safe: false,
      reason: `Destructive pattern detected in command: "${cmd}"`
    };
  }

  if (!isPathSafe(cmd, workspacePath)) {
    return {
      safe: false,
      reason: `Access attempt outside workspace path "${workspacePath}": "${cmd}"`
    };
  }

  return { safe: true };
}
