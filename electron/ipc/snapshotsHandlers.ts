import type { IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { computeHash, verifyHash } from '../../src/lib/integrityChecksum';
import { assertSafeId } from '../../src/lib/pathSafety';

/**
 * Snapshots IPC handlers (snapshots:load-all / create / load-payload / restore).
 * Relocated verbatim from electron/main.ts (W5 PR 10) as a behavior-preserving
 * change -- all four handler bodies are unchanged.
 *
 * snapshots:restore is TOCTOU-sensitive (audit M3.4): it writes a full temp
 * restore tree, verifies the snapshot hash BEFORE touching live files, then
 * swaps files/folders into place, cleaning up the temp dir on both success and
 * failure. This relocation preserves that sequence exactly -- no hardening or
 * simplification was applied here.
 *
 * Dependencies: `restore` resolves destination folders across four domains, so
 * getSnapshotsDir / getEvalsDir / getTimelineDir / getGovernanceDir (all
 * DATA_DIR-bound resolvers from createWorkspacePaths) are injected. The pure
 * helpers computeHash/verifyHash (canonical src/lib/integrityChecksum) and
 * assertSafeId (src/lib/pathSafety) are imported directly, as is node `crypto`
 * (snapshotId generation) and fs/path. The block never reads mainWindow and logs
 * only via console.error. All four channels use ipcMain.handle.
 */
export interface SnapshotsHandlerDeps {
  ipcMain: IpcMain;
  getSnapshotsDir: (rootPath: string | null, presetId: string) => string;
  getEvalsDir: (rootPath: string | null, presetId: string) => string;
  getTimelineDir: (rootPath: string | null, presetId: string) => string;
  getGovernanceDir: (rootPath: string | null, presetId: string) => string;
}

export function registerSnapshotsHandlers(deps: SnapshotsHandlerDeps): void {
  const { ipcMain, getSnapshotsDir, getEvalsDir, getTimelineDir, getGovernanceDir } = deps;

  ipcMain.handle('snapshots:load-all', async (_event, { rootPath, presetId }) => {
    try {
      const snapshotsDir = getSnapshotsDir(rootPath, presetId);
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }
      const files = fs.readdirSync(snapshotsDir);
      const list: any[] = [];

      for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('temp_')) {
          const filePath = path.join(snapshotsDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const snap = JSON.parse(content);

            // Verify hash of full snapshot
            const integrityStatus = verifyHash(snap);

            list.push({
              ...snap.manifest,
              integrityStatus
            });
          } catch (e) {
            console.error(`Failed to parse snapshot file ${file}:`, e);
          }
        }
      }

      // Sort descending by timestamp
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return list;
    } catch (error) {
      console.error('Failed to load snapshots:', error);
      return [];
    }
  });

  ipcMain.handle('snapshots:create', async (_event, { rootPath, presetId, description, type, payload, parentSnapshotId }) => {
    try {
      const snapshotsDir = getSnapshotsDir(rootPath, presetId);
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }

      const snapshotId = `snap-${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();

      const manifest: any = {
        schemaVersion: 'agentdeck.snapshot.v1',
        snapshotId,
        createdAt,
        workspaceId: presetId,
        description,
        type
      };

      if (parentSnapshotId) {
        manifest.parentSnapshotId = parentSnapshotId;
      }

      const fullSnapshot: any = {
        manifest,
        payload
      };

      // Compute SHA-256 hash of the entire snapshot (excluding hash/integrityStatus inside manifest)
      const hash = computeHash(fullSnapshot);
      fullSnapshot.manifest.hash = hash;

      const filePath = path.join(snapshotsDir, `snapshot-${assertSafeId(snapshotId, 'snapshotId')}.json`);
      fs.writeFileSync(filePath, JSON.stringify(fullSnapshot, null, 2), 'utf-8');

      return {
        ...fullSnapshot.manifest,
        integrityStatus: 'verified'
      };
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      throw error;
    }
  });

  ipcMain.handle('snapshots:load-payload', async (_event, { rootPath, presetId, snapshotId }) => {
    try {
      const snapshotsDir = getSnapshotsDir(rootPath, presetId);
      const filePath = path.join(snapshotsDir, `snapshot-${assertSafeId(snapshotId, 'snapshotId')}.json`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Snapshot with ID ${snapshotId} not found.`);
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const snap = JSON.parse(content);
      return snap.payload;
    } catch (error) {
      console.error('Failed to load snapshot payload:', error);
      throw error;
    }
  });

  ipcMain.handle('snapshots:restore', async (_event, { rootPath, presetId, snapshotId }) => {
    const snapshotsDir = getSnapshotsDir(rootPath, presetId);
    const tempRestoreDir = path.join(snapshotsDir, `temp_restore_${Date.now()}`);

    try {
      const snapshotPath = path.join(snapshotsDir, `snapshot-${assertSafeId(snapshotId, 'snapshotId')}.json`);
      if (!fs.existsSync(snapshotPath)) {
        return { success: false, error: `Snapshot ${snapshotId} does not exist.` };
      }

      const snapContent = fs.readFileSync(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(snapContent);

      // 1. Verify Hash
      const integrity = verifyHash(snapshot);
      if (integrity !== 'verified') {
        return { success: false, error: `Restore blocked: Snapshot hash integrity check failed (${integrity.toUpperCase()}).` };
      }

      // Create temp restore directory
      fs.mkdirSync(tempRestoreDir, { recursive: true });

      const payload = snapshot.payload;
      const isPreset = ['sound-machina', 'tm4', 'robotstore'].includes(presetId);

      // Resolve destination folders
      const evalsDir = getEvalsDir(rootPath, presetId);
      const timelineDir = getTimelineDir(rootPath, presetId);
      const govDir = getGovernanceDir(rootPath, presetId);

      // 2. Write temp restored files

      // A. Workspace manifest (if not a static built-in preset)
      if (!isPreset && rootPath) {
        const tempConfigPath = path.join(tempRestoreDir, 'workspace.json');
        fs.writeFileSync(tempConfigPath, JSON.stringify(payload.manifest, null, 2), 'utf-8');
      }

      // B. Governance files
      const tempGovDir = path.join(tempRestoreDir, 'governance');
      fs.mkdirSync(tempGovDir, { recursive: true });
      fs.writeFileSync(path.join(tempGovDir, 'policies.json'), JSON.stringify(payload.policies, null, 2), 'utf-8');
      fs.writeFileSync(path.join(tempGovDir, 'release_candidates.json'), JSON.stringify(payload.releaseCandidates, null, 2), 'utf-8');

      // C. Evals files
      const tempEvalsDir = path.join(tempRestoreDir, 'evals');
      fs.mkdirSync(tempEvalsDir, { recursive: true });
      fs.writeFileSync(path.join(tempEvalsDir, 'benchmarks.json'), JSON.stringify(payload.benchmarks || [], null, 2), 'utf-8');
      fs.writeFileSync(path.join(tempEvalsDir, 'judges.json'), JSON.stringify(payload.judges || [], null, 2), 'utf-8');
      fs.writeFileSync(path.join(tempEvalsDir, 'promotions.json'), JSON.stringify(payload.promotions || [], null, 2), 'utf-8');
      fs.writeFileSync(path.join(tempEvalsDir, 'regression_runs.json'), JSON.stringify(payload.regressionRuns || [], null, 2), 'utf-8');

      const tempFailuresDir = path.join(tempEvalsDir, 'failures');
      fs.mkdirSync(tempFailuresDir, { recursive: true });
      if (Array.isArray(payload.failures)) {
        for (const fail of payload.failures) {
          fs.writeFileSync(path.join(tempFailuresDir, `fail-${fail.id}.json`), JSON.stringify(fail, null, 2), 'utf-8');
        }
      }

      const tempGoldStandardsDir = path.join(tempEvalsDir, 'gold-standards');
      fs.mkdirSync(tempGoldStandardsDir, { recursive: true });
      if (Array.isArray(payload.goldStandards)) {
        for (const item of payload.goldStandards) {
          fs.writeFileSync(path.join(tempGoldStandardsDir, `gold-${assertSafeId(item.id, 'gold standard id')}.json`), JSON.stringify(item, null, 2), 'utf-8');
        }
      }

      // D. Timeline files
      const tempTimelineDir = path.join(tempRestoreDir, 'timeline');
      fs.mkdirSync(tempTimelineDir, { recursive: true });
      if (Array.isArray(payload.timelineEvents)) {
        for (const ev of payload.timelineEvents) {
          fs.writeFileSync(path.join(tempTimelineDir, `event-${ev.id}.json`), JSON.stringify(ev, null, 2), 'utf-8');
        }
      }

      // 3. Swap / replace target files and folders

      // A. Restore workspace config manifest (if not preset)
      if (!isPreset && rootPath) {
        const configPath = path.join(rootPath, '.agentdeck', 'workspace.json');
        if (fs.existsSync(path.join(tempRestoreDir, 'workspace.json'))) {
          fs.copyFileSync(path.join(tempRestoreDir, 'workspace.json'), configPath);
        }
      }

      // B. Replace Governance directory files
      if (!fs.existsSync(govDir)) fs.mkdirSync(govDir, { recursive: true });
      fs.copyFileSync(path.join(tempGovDir, 'policies.json'), path.join(govDir, 'policies.json'));
      fs.copyFileSync(path.join(tempGovDir, 'release_candidates.json'), path.join(govDir, 'release_candidates.json'));

      // C. Replace Evals files and directories
      if (!fs.existsSync(evalsDir)) fs.mkdirSync(evalsDir, { recursive: true });
      fs.copyFileSync(path.join(tempEvalsDir, 'benchmarks.json'), path.join(evalsDir, 'benchmarks.json'));
      fs.copyFileSync(path.join(tempEvalsDir, 'judges.json'), path.join(evalsDir, 'judges.json'));
      fs.copyFileSync(path.join(tempEvalsDir, 'promotions.json'), path.join(evalsDir, 'promotions.json'));
      fs.copyFileSync(path.join(tempEvalsDir, 'regression_runs.json'), path.join(evalsDir, 'regression_runs.json'));

      // Swap failures folder
      const destFailuresDir = path.join(evalsDir, 'failures');
      if (fs.existsSync(destFailuresDir)) fs.rmSync(destFailuresDir, { recursive: true, force: true });
      if (fs.existsSync(tempFailuresDir)) {
        fs.cpSync(tempFailuresDir, destFailuresDir, { recursive: true });
      } else {
        fs.mkdirSync(destFailuresDir, { recursive: true });
      }

      // Swap gold standards folder
      const destGoldStandardsDir = path.join(evalsDir, 'gold-standards');
      if (fs.existsSync(destGoldStandardsDir)) fs.rmSync(destGoldStandardsDir, { recursive: true, force: true });
      if (fs.existsSync(tempGoldStandardsDir)) {
        fs.cpSync(tempGoldStandardsDir, destGoldStandardsDir, { recursive: true });
      } else {
        fs.mkdirSync(destGoldStandardsDir, { recursive: true });
      }

      // D. Swap timeline events folder
      if (fs.existsSync(timelineDir)) fs.rmSync(timelineDir, { recursive: true, force: true });
      if (fs.existsSync(tempTimelineDir)) {
        fs.cpSync(tempTimelineDir, timelineDir, { recursive: true });
      } else {
        fs.mkdirSync(timelineDir, { recursive: true });
      }

      // Cleanup temp directory
      fs.rmSync(tempRestoreDir, { recursive: true, force: true });

      return { success: true };
    } catch (error: any) {
      console.error('Failed to restore snapshot:', error);
      try {
        if (fs.existsSync(tempRestoreDir)) {
          fs.rmSync(tempRestoreDir, { recursive: true, force: true });
        }
      } catch (_) {}
      return { success: false, error: error.message };
    }
  });
}
