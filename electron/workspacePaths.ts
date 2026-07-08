import path from 'path';
import fs from 'fs';
import { isWorkspaceRootSafe } from '../src/lib/pathSafety';

/**
 * Workspace path-resolver foundation (W5 PR 5).
 *
 * These resolvers were previously defined inline in electron/main.ts, each with
 * its own local `const PRESET_IDS`. Centralized here as a behavior-preserving
 * extraction: the path shapes are byte-for-byte identical to the originals.
 *
 * DATA_DIR is injected via createWorkspacePaths() rather than recomputed, so it
 * stays single-sourced in main.ts and this module has no dependency on
 * process.cwd() timing. The module imports only the pure `pathSafety` lib plus
 * node built-ins — no Electron runtime, no handler modules — so it is safe to
 * import from anywhere without circular-import risk.
 *
 * Two intentional asymmetries preserved from the originals:
 *   - getEvalsDir's preset/fallback path has NO trailing subdirectory (it is the
 *     `presets-evals/<presetId>` base itself), unlike the other resolvers which
 *     append their domain folder.
 *   - getDecisionsDir's rootPath branch nests under `.agentdeck/governance/
 *     decisions` (not `.agentdeck/decisions`), while its preset/fallback branch
 *     is `presets-evals/<presetId>/decisions` (not under governance).
 */

// Preset workspace ids that resolve to the bundled DATA_DIR/presets-evals tree
// instead of a user rootPath's .agentdeck folder.
export const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];

export interface WorkspacePaths {
  getEvalsDir(rootPath: string | null, presetId: string): string;
  getTimelineDir(rootPath: string | null, presetId: string): string;
  getGovernanceDir(rootPath: string | null, presetId: string): string;
  getSnapshotsDir(rootPath: string | null, presetId: string): string;
  getDecisionsDir(rootPath: string | null, presetId: string): string;
  getProvenancePath(rootPath: string | null, presetId: string): string;
}

export function createWorkspacePaths(dataDir: string): WorkspacePaths {
  function getEvalsDir(rootPath: string | null, presetId: string): string {
    if (PRESET_IDS.includes(presetId)) {
      return path.join(dataDir, 'presets-evals', presetId);
    }
    if (rootPath && isWorkspaceRootSafe(rootPath) && fs.existsSync(rootPath)) {
      return path.join(rootPath, '.agentdeck', 'evals');
    } else {
      return path.join(dataDir, 'presets-evals', presetId);
    }
  }

  function getTimelineDir(rootPath: string | null, presetId: string): string {
    if (PRESET_IDS.includes(presetId)) {
      return path.join(dataDir, 'presets-evals', presetId, 'timeline');
    }
    if (rootPath && isWorkspaceRootSafe(rootPath) && fs.existsSync(rootPath)) {
      return path.join(rootPath, '.agentdeck', 'timeline');
    } else {
      return path.join(dataDir, 'presets-evals', presetId, 'timeline');
    }
  }

  function getGovernanceDir(rootPath: string | null, presetId: string): string {
    if (PRESET_IDS.includes(presetId)) {
      return path.join(dataDir, 'presets-evals', presetId, 'governance');
    }
    if (rootPath && isWorkspaceRootSafe(rootPath) && fs.existsSync(rootPath)) {
      return path.join(rootPath, '.agentdeck', 'governance');
    } else {
      return path.join(dataDir, 'presets-evals', presetId, 'governance');
    }
  }

  function getSnapshotsDir(rootPath: string | null, presetId: string): string {
    if (PRESET_IDS.includes(presetId)) {
      return path.join(dataDir, 'presets-evals', presetId, 'snapshots');
    }
    if (rootPath && isWorkspaceRootSafe(rootPath) && fs.existsSync(rootPath)) {
      return path.join(rootPath, '.agentdeck', 'snapshots');
    } else {
      return path.join(dataDir, 'presets-evals', presetId, 'snapshots');
    }
  }

  function getDecisionsDir(rootPath: string | null, presetId: string): string {
    if (PRESET_IDS.includes(presetId)) {
      return path.join(dataDir, 'presets-evals', presetId, 'decisions');
    }
    if (rootPath && isWorkspaceRootSafe(rootPath) && fs.existsSync(rootPath)) {
      return path.join(rootPath, '.agentdeck', 'governance', 'decisions');
    } else {
      return path.join(dataDir, 'presets-evals', presetId, 'decisions');
    }
  }

  // Provenance lives inside the governance dir; this nested relationship is
  // preserved exactly (it resolves via getGovernanceDir, not independently).
  function getProvenancePath(rootPath: string | null, presetId: string): string {
    const govDir = getGovernanceDir(rootPath, presetId);
    return path.join(govDir, 'provenance.json');
  }

  return {
    getEvalsDir,
    getTimelineDir,
    getGovernanceDir,
    getSnapshotsDir,
    getDecisionsDir,
    getProvenancePath,
  };
}
