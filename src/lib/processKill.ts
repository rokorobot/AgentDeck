// Pure argv builder for Windows process-tree termination (audit WS4).
// Returning an argument array (rather than a shell string) lets the caller use
// execFile/spawn with shell:false, so the PID is always a literal argument and
// no shell ever interprets it.

/**
 * Build the argument vector for `taskkill` to force-kill a process tree by PID.
 * `/F` = force, `/T` = include child processes.
 */
export function buildTaskkillArgs(pid: number): string[] {
  return ['/F', '/T', '/PID', String(pid)];
}
