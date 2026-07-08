import type { IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { computeHash, verifyHash } from '../../src/lib/integrityChecksum';

/**
 * Governance IPC handlers (governance:load-data / save-policies /
 * save-candidates). Relocated verbatim from electron/main.ts (W5 PR 7) as a
 * behavior-preserving change -- the three handler bodies, including the preset
 * default policies/candidate seeds and their Date.now()-based timestamps, are
 * unchanged.
 *
 * Dependencies: `getGovernanceDir` is injected because it is the DATA_DIR-bound
 * resolver created in main.ts (createWorkspacePaths(DATA_DIR)). The pure
 * checksum helpers computeHash/verifyHash are imported directly from the
 * canonical src/lib/integrityChecksum. `fs`/`path` are node built-ins used
 * as-is. The block never reads mainWindow and logs only via console.error, so
 * nothing else is injected. All three channels use ipcMain.handle.
 */
export interface GovernanceHandlerDeps {
  ipcMain: IpcMain;
  getGovernanceDir: (rootPath: string | null, presetId: string) => string;
}

export function registerGovernanceHandlers(deps: GovernanceHandlerDeps): void {
  const { ipcMain, getGovernanceDir } = deps;

  ipcMain.handle('governance:load-data', async (_event, { rootPath, presetId }) => {
    try {
      const govDir = getGovernanceDir(rootPath, presetId);
      if (!fs.existsSync(govDir)) {
        fs.mkdirSync(govDir, { recursive: true });
      }

      const policiesPath = path.join(govDir, 'policies.json');
      const candidatesPath = path.join(govDir, 'release_candidates.json');

      let policies: any = null;
      let releaseCandidates: any[] = [];

      // Load or seed policies
      if (fs.existsSync(policiesPath)) {
        policies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));
        policies.integrityStatus = verifyHash(policies);
      } else {
        // Default Mock Policies for Presets
        if (presetId === 'sound-machina') {
          policies = {
            schemaVersion: 'agentdeck.governance.v1',
            minScore: 0.80,
            allowRegression: false,
            requireApproval: true
          };
        } else if (presetId === 'tm4') {
          policies = {
            schemaVersion: 'agentdeck.governance.v1',
            minScore: 0.95,
            allowRegression: false,
            requireApproval: true
          };
        } else {
          policies = {
            schemaVersion: 'agentdeck.governance.v1',
            minScore: 0.80,
            allowRegression: false,
            requireApproval: false
          };
        }
        policies.hash = computeHash(policies);
        policies.integrityStatus = 'verified';
        fs.writeFileSync(policiesPath, JSON.stringify(policies, null, 2), 'utf-8');
      }

      // Load or seed release candidates
      if (fs.existsSync(candidatesPath)) {
        const list = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
        releaseCandidates = list.map((rc: any) => {
          rc.integrityStatus = verifyHash(rc);
          return rc;
        });
      } else {
        // Seed an initial demo release candidate if empty for presets
        if (presetId === 'sound-machina') {
          releaseCandidates = [
            {
              id: 'rc-seed-sm-1',
              schemaVersion: 'agentdeck.governance.v1',
              version: 'v1.0.0-rc1',
              timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
              status: 'approved',
              score: 0.88,
              benchmarkId: 'sound-machina-prompt-quality',
              failuresCount: 0,
              timelineEventId: 'seed-sm-1',
              policyResult: 'pass',
              policyReasons: ['Score 0.88 is above minScore 0.80', 'No regressions detected'],
              notes: 'Production ready audio generation engine.',
              approvedBy: 'operator',
              approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 23.5).toISOString()
            }
          ];
        } else if (presetId === 'tm4') {
          releaseCandidates = [
            {
              id: 'rc-seed-tm-1',
              schemaVersion: 'agentdeck.governance.v1',
              version: 'v0.9.0-rc1',
              timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
              status: 'released',
              score: 0.98,
              benchmarkId: 'tm4-governance-compliance',
              failuresCount: 0,
              timelineEventId: 'seed-tm-2',
              policyResult: 'pass',
              policyReasons: ['Score 0.98 is above minScore 0.95'],
              notes: 'Compliance criteria fully satisfied. Released to staging operator check.',
              approvedBy: 'operator',
              approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 47).toISOString()
            }
          ];
        }

        releaseCandidates = releaseCandidates.map((rc: any) => {
          rc.hash = computeHash(rc);
          rc.integrityStatus = 'verified';
          return rc;
        });
        fs.writeFileSync(candidatesPath, JSON.stringify(releaseCandidates, null, 2), 'utf-8');
      }

      return { policies, releaseCandidates };
    } catch (error) {
      console.error('Failed to load governance data:', error);
      return { policies: null, releaseCandidates: [] };
    }
  });

  ipcMain.handle('governance:save-policies', async (_event, { rootPath, presetId, policies }) => {
    try {
      const govDir = getGovernanceDir(rootPath, presetId);
      if (!fs.existsSync(govDir)) {
        fs.mkdirSync(govDir, { recursive: true });
      }
      policies.hash = computeHash(policies);
      const filePath = path.join(govDir, 'policies.json');
      fs.writeFileSync(filePath, JSON.stringify(policies, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save governance policies:', error);
      return false;
    }
  });

  ipcMain.handle('governance:save-candidates', async (_event, { rootPath, presetId, list }) => {
    try {
      const govDir = getGovernanceDir(rootPath, presetId);
      if (!fs.existsSync(govDir)) {
        fs.mkdirSync(govDir, { recursive: true });
      }
      const listWithHashes = list.map((rc: any) => {
        rc.hash = computeHash(rc);
        return rc;
      });
      const filePath = path.join(govDir, 'release_candidates.json');
      fs.writeFileSync(filePath, JSON.stringify(listWithHashes, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save release candidates list:', error);
      return false;
    }
  });
}
