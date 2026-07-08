import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import { createWorkspacePaths, PRESET_IDS } from '../electron/workspacePaths';

// W5 PR 5 foundation: workspacePaths.ts centralizes the per-domain directory
// resolvers previously inline in electron/main.ts. These tests pin the exact
// path shapes -- including the two asymmetries (getEvalsDir has no suffix;
// getDecisionsDir's rootPath branch nests under governance) and the nested
// getProvenancePath -> getGovernanceDir relationship.

const DATA = 'C:\\data';
const ROOT = 'C:\\real-ws';
const norm = (p: string) => p.replace(/\\/g, '/');

function paths() {
  return createWorkspacePaths(DATA);
}

afterEach(() => vi.restoreAllMocks());

describe('PRESET_IDS', () => {
  it('is exactly the three bundled preset ids', () => {
    expect(PRESET_IDS).toEqual(['sound-machina', 'tm4', 'robotstore']);
  });
});

describe('preset workspaces resolve under DATA_DIR/presets-evals (rootPath ignored)', () => {
  it('each resolver maps a preset id to the correct bundled path', () => {
    const p = paths();
    // rootPath is passed but must be ignored for presets.
    expect(norm(p.getEvalsDir(ROOT, 'tm4'))).toBe('C:/data/presets-evals/tm4');
    expect(norm(p.getTimelineDir(ROOT, 'tm4'))).toBe('C:/data/presets-evals/tm4/timeline');
    expect(norm(p.getGovernanceDir(ROOT, 'tm4'))).toBe('C:/data/presets-evals/tm4/governance');
    expect(norm(p.getSnapshotsDir(ROOT, 'tm4'))).toBe('C:/data/presets-evals/tm4/snapshots');
    expect(norm(p.getDecisionsDir(ROOT, 'tm4'))).toBe('C:/data/presets-evals/tm4/decisions');
    expect(norm(p.getProvenancePath(ROOT, 'tm4'))).toBe('C:/data/presets-evals/tm4/governance/provenance.json');
  });

  it('getEvalsDir preset path has NO trailing subdirectory (asymmetry preserved)', () => {
    const p = paths();
    // It is the presets-evals/<id> base itself, unlike the others.
    expect(norm(p.getEvalsDir(null, 'sound-machina'))).toBe('C:/data/presets-evals/sound-machina');
  });
});

describe('non-preset with a valid, existing rootPath resolves under <rootPath>/.agentdeck', () => {
  it('each resolver maps to the workspace .agentdeck subtree', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const p = paths();
    expect(norm(p.getEvalsDir(ROOT, 'custom'))).toBe('C:/real-ws/.agentdeck/evals');
    expect(norm(p.getTimelineDir(ROOT, 'custom'))).toBe('C:/real-ws/.agentdeck/timeline');
    expect(norm(p.getGovernanceDir(ROOT, 'custom'))).toBe('C:/real-ws/.agentdeck/governance');
    expect(norm(p.getSnapshotsDir(ROOT, 'custom'))).toBe('C:/real-ws/.agentdeck/snapshots');
    expect(norm(p.getProvenancePath(ROOT, 'custom'))).toBe('C:/real-ws/.agentdeck/governance/provenance.json');
  });

  it('getDecisionsDir rootPath branch nests under governance/decisions (asymmetry preserved)', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const p = paths();
    expect(norm(p.getDecisionsDir(ROOT, 'custom'))).toBe('C:/real-ws/.agentdeck/governance/decisions');
  });
});

describe('non-preset fallbacks resolve back under DATA_DIR/presets-evals/<presetId>', () => {
  it('falls back when rootPath is null', () => {
    const p = paths();
    expect(norm(p.getGovernanceDir(null, 'custom'))).toBe('C:/data/presets-evals/custom/governance');
    // getDecisionsDir fallback is NOT nested under governance (unlike its rootPath branch).
    expect(norm(p.getDecisionsDir(null, 'custom'))).toBe('C:/data/presets-evals/custom/decisions');
  });

  it('falls back when rootPath fails the safety check (relative or "..")', () => {
    const p = paths();
    // isWorkspaceRootSafe rejects relative paths and ".." traversal -> fallback.
    expect(norm(p.getEvalsDir('relative/dir', 'custom'))).toBe('C:/data/presets-evals/custom');
    expect(norm(p.getEvalsDir('C:\\a\\..\\..\\Windows', 'custom'))).toBe('C:/data/presets-evals/custom');
  });

  it('falls back when rootPath is safe but does not exist on disk', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const p = paths();
    expect(norm(p.getSnapshotsDir(ROOT, 'custom'))).toBe('C:/data/presets-evals/custom/snapshots');
  });
});

describe('getProvenancePath is derived from getGovernanceDir (nested relationship preserved)', () => {
  it('always equals getGovernanceDir(...) + /provenance.json across branches', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const p = paths();
    for (const [root, preset] of [[ROOT, 'custom'], [null, 'tm4'], [null, 'custom']] as const) {
      expect(norm(p.getProvenancePath(root, preset)))
        .toBe(norm(p.getGovernanceDir(root, preset)) + '/provenance.json');
    }
  });
});
