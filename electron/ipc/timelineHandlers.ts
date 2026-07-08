import type { IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { computeHash, verifyHash } from '../../src/lib/integrityChecksum';
import { assertSafeId } from '../../src/lib/pathSafety';

/**
 * Timeline IPC handlers (timeline:load-events / save-event). Relocated verbatim
 * from electron/main.ts (W5 PR 8) as a behavior-preserving change -- the two
 * handler bodies, including the full preset auto-seed events and their
 * `new Date()`-relative timestamps, are unchanged.
 *
 * The in-body `PRESET_IDS` constant is intentionally kept local (not swapped for
 * the centralized workspacePaths export): this PR prioritizes verbatim behavior
 * preservation over deduplication.
 *
 * Dependencies: `getTimelineDir` is injected because it is the DATA_DIR-bound
 * resolver created in main.ts (createWorkspacePaths(DATA_DIR)). The pure helpers
 * computeHash/verifyHash (canonical src/lib/integrityChecksum) and assertSafeId
 * (src/lib/pathSafety, used to sanitize the save-event filename) are imported
 * directly. `fs`/`path` are node built-ins used as-is. The block never reads
 * mainWindow and logs only via console.error. Both channels use ipcMain.handle.
 */
export interface TimelineHandlerDeps {
  ipcMain: IpcMain;
  getTimelineDir: (rootPath: string | null, presetId: string) => string;
}

export function registerTimelineHandlers(deps: TimelineHandlerDeps): void {
  const { ipcMain, getTimelineDir } = deps;

  ipcMain.handle('timeline:load-events', async (_event, { rootPath, presetId }) => {
    try {
      const timelineDir = getTimelineDir(rootPath, presetId);
      if (!fs.existsSync(timelineDir)) {
        fs.mkdirSync(timelineDir, { recursive: true });
      }

      let files = fs.readdirSync(timelineDir);

      // Auto-seed if timeline is empty and it's a preset
      const PRESET_IDS = ['sound-machina', 'tm4', 'robotstore'];
      if (files.length === 0 && PRESET_IDS.includes(presetId)) {
        const defaultEvents: any[] = [];
        const now = new Date();

        if (presetId === 'sound-machina') {
          defaultEvents.push(
            {
              id: 'seed-sm-1',
              schemaVersion: 'agentdeck.timeline.v1',
              timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
              workspaceId: presetId,
              type: 'service_started',
              severity: 'info',
              actor: 'operator',
              isSeeded: true,
              referenceId: 'service-sm-powershell',
              summary: 'Audio generation service started on local shell powershell (SEEDED SAMPLE)',
              metadata: {
                logsSnapshot: [
                  '[12:00:00 AM] [TerminalManager] Spawned session term-sound-machina-powershell',
                  '[12:00:01 AM] Suno v3 engine online',
                  '[12:00:02 AM] Listening on http://localhost:3000'
                ]
              }
            },
            {
              id: 'seed-sm-2',
              schemaVersion: 'agentdeck.timeline.v1',
              timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 1.5).toISOString(), // 1.5 hours ago
              workspaceId: presetId,
              type: 'regression_executed',
              severity: 'warning',
              actor: 'simulator',
              isSeeded: true,
              referenceId: 'run-sound-machina-1',
              summary: 'Sound Machina Prompt Quality regression run completed - 1 fault detected (SEEDED SAMPLE)',
              metadata: {
                benchmarkScore: 0.78,
                baselineScore: 0.81,
                passRate: 75,
                failuresCount: 1,
                logsSnapshot: [
                  '[Evaluator] Deploying test prompt instances against local models...',
                  '[Evaluator] CASE SM-1: PASSED (score: 0.88)',
                  '[Evaluator] CASE SM-2: PASSED (score: 0.84)',
                  '[Evaluator] CASE SM-3: FAILED (score: 0.62) - Output contains trance synths'
                ]
              }
            },
            {
              id: 'seed-sm-3',
              schemaVersion: 'agentdeck.timeline.v1',
              timestamp: new Date(now.getTime() - 1000 * 60 * 60).toISOString(), // 1 hour ago
              workspaceId: presetId,
              type: 'failure_converted',
              severity: 'success',
              actor: 'operator',
              isSeeded: true,
              referenceId: 'fail-sound-machina-1',
              summary: 'Converted faulty bassline output to a permanent test case spec in Sound Machina Prompt Quality (SEEDED SAMPLE)',
              metadata: {
                failuresCount: 0,
                logsSnapshot: [
                  '[Operator Action] Initiating Failure -> Test Spec Conversion',
                  '[Store] Stored testcase tc-seed-sm-1 with threshold 0.80'
                ]
              }
            },
            {
              id: 'seed-sm-4',
              schemaVersion: 'agentdeck.timeline.v1',
              timestamp: new Date(now.getTime() - 1000 * 60 * 30).toISOString(), // 30 mins ago
              workspaceId: presetId,
              type: 'baseline_promoted',
              severity: 'success',
              actor: 'operator',
              isSeeded: true,
              referenceId: 'run-sound-machina-2',
              summary: 'Baseline target score promoted: 0.81 -> 0.87 (SEEDED SAMPLE)',
              metadata: {
                baselineScore: 0.87,
                oldScore: 0.81,
                logsSnapshot: [
                  '[Promoter] Verified regression run run-sound-machina-2 passes safety threshold',
                  '[Governance] Baseline updated to 0.87'
                ]
              }
            }
          );
        } else if (presetId === 'tm4') {
          defaultEvents.push(
            {
              id: 'seed-tm-1',
              schemaVersion: 'agentdeck.timeline.v1',
              timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 3).toISOString(),
              workspaceId: presetId,
              type: 'service_started',
              severity: 'info',
              actor: 'operator',
              isSeeded: true,
              referenceId: 'service-tm4-fastapi',
              summary: 'FastAPI Governance Engine started on port 8000 (SEEDED SAMPLE)',
              metadata: {
                logsSnapshot: [
                  '[09:00:00 AM] Uvicorn running on http://127.0.0.1:8000',
                  '[09:00:01 AM] Loaded security rubrics configuration'
                ]
              }
            },
            {
              id: 'seed-tm-2',
              schemaVersion: 'agentdeck.timeline.v1',
              timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(),
              workspaceId: presetId,
              type: 'regression_executed',
              severity: 'success',
              actor: 'simulator',
              isSeeded: true,
              referenceId: 'run-tm4-1',
              summary: 'TM4 Governance Compliance regression check completed successfully (SEEDED SAMPLE)',
              metadata: {
                benchmarkScore: 0.98,
                baselineScore: 0.95,
                passRate: 100,
                failuresCount: 0,
                logsSnapshot: [
                  '[Evaluator] Auditing compliance templates...',
                  '[Evaluator] Report completeness check: 0.99',
                  '[Evaluator] Artifact integrity check: 0.97',
                  '[Evaluator] SUCCESS - 100% compliance met'
                ]
              }
            }
          );
        } else if (presetId === 'robotstore') {
          defaultEvents.push(
            {
              id: 'seed-rs-1',
              schemaVersion: 'agentdeck.timeline.v1',
              timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 4).toISOString(),
              workspaceId: presetId,
              type: 'service_started',
              severity: 'info',
              actor: 'operator',
              isSeeded: true,
              referenceId: 'service-rs-vite',
              summary: 'RobotStore React UI Frontend dev server started (SEEDED SAMPLE)',
              metadata: {
                logsSnapshot: [
                  '[VITE] dev server running on http://localhost:5173'
                ]
              }
            }
          );
        }

        for (const ev of defaultEvents) {
          ev.hash = computeHash(ev);
          const filePath = path.join(timelineDir, `event-${ev.id}.json`);
          fs.writeFileSync(filePath, JSON.stringify(ev, null, 2), 'utf-8');
        }
        files = fs.readdirSync(timelineDir);
      }

      const events: any[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(timelineDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ev = JSON.parse(content);
            ev.integrityStatus = verifyHash(ev);
            events.push(ev);
          } catch (e) {
            console.error(`Failed to parse timeline event file ${file}:`, e);
          }
        }
      }
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return events;
    } catch (error) {
      console.error('Failed to load timeline events:', error);
      return [];
    }
  });

  ipcMain.handle('timeline:save-event', async (_event, { rootPath, presetId, event }) => {
    try {
      const timelineDir = getTimelineDir(rootPath, presetId);
      if (!fs.existsSync(timelineDir)) {
        fs.mkdirSync(timelineDir, { recursive: true });
      }
      event.hash = computeHash(event);
      const filePath = path.join(timelineDir, `event-${assertSafeId(event.id, 'event id')}.json`);
      fs.writeFileSync(filePath, JSON.stringify(event, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save timeline event:', error);
      return false;
    }
  });
}
