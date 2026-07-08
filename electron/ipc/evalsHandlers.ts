import type { IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { assertSafeId } from '../../src/lib/pathSafety';

/**
 * Evals IPC handlers (evals:load-data plus eight save/delete channels).
 * Relocated verbatim from electron/main.ts (W5 PR 9) as a behavior-preserving
 * change -- all nine handler bodies, including the full preset/default seed data
 * (benchmarks, runs, failures, gold-standards, judges, promotions) and their
 * `Date.now()`-relative timestamps, are unchanged.
 *
 * NOTE: unlike the provenance/governance/timeline domains, the evals handlers do
 * NOT compute or verify integrity checksums -- load-data returns raw parsed data
 * with no integrityStatus stamping, and the save handlers persist as-is. So
 * computeHash/verifyHash are intentionally NOT imported here.
 *
 * Dependencies: `getEvalsDir` is injected because it is the DATA_DIR-bound
 * resolver created in main.ts (createWorkspacePaths(DATA_DIR)). `assertSafeId`
 * (src/lib/pathSafety) is imported directly -- it sanitizes the failure and
 * gold-standard filenames/ids. `fs`/`path` are node built-ins used as-is. The
 * block never reads mainWindow and logs only via console.error. All nine
 * channels use ipcMain.handle.
 */
export interface EvalsHandlerDeps {
  ipcMain: IpcMain;
  getEvalsDir: (rootPath: string | null, presetId: string) => string;
}

export function registerEvalsHandlers(deps: EvalsHandlerDeps): void {
  const { ipcMain, getEvalsDir } = deps;

  ipcMain.handle('evals:load-data', async (_event, { rootPath, presetId }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      const failuresDir = path.join(evalsDir, 'failures');

      const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
      const runsPath = path.join(evalsDir, 'regression_runs.json');

      let benchmarks: any[] = [];
      let runs: any[] = [];
      let failures: any[] = [];

      // Load Benchmarks
      if (fs.existsSync(benchmarksPath)) {
        benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8'));
      } else {
        // Default Mock Presets
        if (presetId === 'sound-machina') {
          benchmarks = [
            {
              id: 'sound-machina-prompt-quality',
              name: 'Sound Machina Prompt Quality',
              description: 'Evaluates quality of generated music prompts against core aesthetic criteria.',
              criteria: ['Melodic structure', 'Novelty', 'Genre consistency', 'Production usability'],
              baselineScore: 0.87,
              goldStandardsCount: 15,
              testCases: [
                {
                  id: 'tc-suno-1',
                  benchmarkId: 'sound-machina-prompt-quality',
                  prompt: 'Chill lofi hiphop beat with jazzy piano chords',
                  expected: 'Smooth lofi drums, vinyl crackle, warm rhodes/piano chords, and mellow bassline.',
                  threshold: 0.8
                },
                {
                  id: 'tc-suno-2',
                  benchmarkId: 'sound-machina-prompt-quality',
                  prompt: 'Industrial techno track with driving bass and metallic synth hits',
                  expected: 'Heavy 4/4 industrial kick drum, aggressive sub-bass rhythm, and metallic percussion loops.',
                  threshold: 0.82
                }
              ]
            }
          ];
        } else if (presetId === 'tm4') {
          benchmarks = [
            {
              id: 'tm4-governance',
              name: 'TM4 Studio Governance',
              description: 'Assesses compliance, artifact integrity, and report completeness of system runs.',
              criteria: ['Report Completeness', 'Governance Compliance', 'Artifact Integrity'],
              baselineScore: 0.97,
              goldStandardsCount: 20,
              testCases: [
                {
                  id: 'tc-tm4-1',
                  benchmarkId: 'tm4-governance',
                  prompt: 'Workspace verification audit run',
                  expected: 'All output manifests comply with v2 schemaVersion and have security logs populated.',
                  threshold: 0.92
                }
              ]
            }
          ];
        } else {
          // Generic defaults
          benchmarks = [
            {
              id: `${presetId}-evals`,
              name: `${presetId} Standard Evaluation`,
              description: 'Default benchmark suite for quality and response integrity.',
              criteria: ['Response accuracy', 'Style alignment', 'Performance'],
              baselineScore: 0.80,
              goldStandardsCount: 5,
              testCases: []
            }
          ];
        }
      }

      // Load Regression Runs
      if (fs.existsSync(runsPath)) {
        runs = JSON.parse(fs.readFileSync(runsPath, 'utf-8'));
      } else {
        // Demo run history
        if (presetId === 'sound-machina') {
          runs = [
            {
              id: 'run-sound-machina-1',
              benchmarkId: 'sound-machina-prompt-quality',
              timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
              score: 0.88,
              baselineScore: 0.87,
              diff: 0.01,
              status: 'pass',
              failuresCount: 0,
              triggerContext: 'Added tempo constraints to Prompt Engine',
              isSimulated: true,
              isApproved: true
            },
            {
              id: 'run-sound-machina-2',
              benchmarkId: 'sound-machina-prompt-quality',
              timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
              score: 0.82,
              baselineScore: 0.87,
              diff: -0.05,
              status: 'regression_detected',
              failuresCount: 1,
              triggerContext: 'Prompt Engine Update (v0.6)',
              isSimulated: true,
              isApproved: false
            }
          ];
        } else if (presetId === 'tm4') {
          runs = [
            {
              id: 'run-tm4-1',
              benchmarkId: 'tm4-governance',
              timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
              score: 0.98,
              baselineScore: 0.97,
              diff: 0.01,
              status: 'pass',
              failuresCount: 0,
              triggerContext: 'Initial baseline evaluation pass',
              isSimulated: true,
              isApproved: true
            }
          ];
        }
      }

      // Load Failures
      if (fs.existsSync(failuresDir)) {
        const files = fs.readdirSync(failuresDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const fileData = fs.readFileSync(path.join(failuresDir, file), 'utf-8');
              failures.push(JSON.parse(fileData));
            } catch (e) {
              console.error('Error reading failure file:', file, e);
            }
          }
        }
      } else {
        // Demo failures
        if (presetId === 'sound-machina') {
          failures = [
            {
              id: 'fail-sound-machina-1',
              benchmarkId: 'sound-machina-prompt-quality',
              prompt: 'Coldwave track',
              expected: 'Generated track has dark synth pads and a prominent 80s drum beat.',
              actual: 'Generated EDM clichés with bright trance leads and 128 bpm drop.',
              failureDescription: 'Generated EDM clichés instead of coldwave elements.',
              resolution: 'Added explicit genre constraints and reference artists to the Coldwave prompt template.',
              resolved: true,
              timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
            }
          ];
        }
      }

      // Load Gold Standards
      const goldStandardsDir = path.join(evalsDir, 'gold-standards');
      let goldStandards: any[] = [];
      if (fs.existsSync(goldStandardsDir)) {
        const files = fs.readdirSync(goldStandardsDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const fileData = fs.readFileSync(path.join(goldStandardsDir, file), 'utf-8');
              goldStandards.push(JSON.parse(fileData));
            } catch (e) {
              console.error('Error reading gold standard file:', file, e);
            }
          }
        }
      } else {
        // Mock Gold Standards for presets
        if (presetId === 'sound-machina') {
          goldStandards = [
            {
              id: 'gold_suno_ambient',
              title: 'Best Ambient Synth Drone',
              content: 'Deep cosmic cinematic background, slow analog modular synth drone, tape hiss, minor chords, pitch drifts, 70 bpm, spacious reverb.',
              tags: ['music', 'ambient', 'suno'],
              type: 'prompt',
              source: 'operator',
              createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
            },
            {
              id: 'gold_youtube_synthwave',
              title: 'Best Synthwave YouTube Release Note',
              content: '🎵 Listen to Sound Machina\'s latest retro synthwave track! Featuring heavy Roland Juno-106 bassline arpeggios, gated LinnDrum hits, and soaring vintage lead synthesizers. #synthwave #musicai #cyberpunk',
              tags: ['text', 'marketing', 'youtube'],
              type: 'output',
              source: 'gold-standard-pipeline',
              createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
            }
          ];
        } else if (presetId === 'tm4') {
          goldStandards = [
            {
              id: 'gold_tm4_arch_report',
              title: 'Standard Architecture Audit Spec',
              content: 'Architecture Compliance Report: Verified TM4 Studio manifest schemas. Target runtime maps to Node.js v18.16. WSL subsystems online. Security policies satisfied.',
              tags: ['audit', 'compliance', 'tm4'],
              type: 'document',
              source: 'lead-architect',
              createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
            }
          ];
        }
      }

      // Load Judges
      const judgesPath = path.join(evalsDir, 'judges.json');
      let judges: any[] = [];
      if (fs.existsSync(judgesPath)) {
        judges = JSON.parse(fs.readFileSync(judgesPath, 'utf-8'));
      } else {
        // Mock Judges for presets
        if (presetId === 'sound-machina') {
          judges = [
            {
              id: 'suno-prompt-judge',
              name: 'SunoPromptJudge',
              criteria: ['clarity', 'musical specificity', 'genre consistency', 'production detail'],
              threshold: 0.8
            }
          ];
        } else if (presetId === 'tm4') {
          judges = [
            {
              id: 'tm4-audit-judge',
              name: 'TM4StudioGovernanceJudge',
              criteria: ['Report Completeness', 'Governance Compliance', 'Artifact Integrity'],
              threshold: 0.9
            }
          ];
        } else {
          judges = [
            {
              id: 'default-judge',
              name: 'DefaultQualityJudge',
              criteria: ['Response accuracy', 'Style alignment', 'Performance'],
              threshold: 0.8
            }
          ];
        }
      }

      // Load Promotions
      const promotionsPath = path.join(evalsDir, 'promotions.json');
      let promotions: any[] = [];
      if (fs.existsSync(promotionsPath)) {
        promotions = JSON.parse(fs.readFileSync(promotionsPath, 'utf-8'));
      } else {
        // Mock Promotions for presets
        if (presetId === 'sound-machina') {
          promotions = [
            {
              timestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
              benchmarkId: 'sound-machina-prompt-quality',
              benchmarkName: 'Sound Machina Prompt Quality',
              oldScore: 0.84,
              newScore: 0.87,
              approvedBy: 'operator',
              reason: 'Tuned model system instructions to prevent trance cliches.',
              runId: 'run-sound-machina-1'
            }
          ];
        }
      }

      return { benchmarks, runs, failures, goldStandards, judges, promotions };
    } catch (error) {
      console.error('Failed to load evals data:', error);
      return { benchmarks: [], runs: [], failures: [], goldStandards: [], judges: [], promotions: [] };
    }
  });

  ipcMain.handle('evals:save-benchmarks', async (_event, { rootPath, presetId, benchmarks }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      if (!fs.existsSync(evalsDir)) {
        fs.mkdirSync(evalsDir, { recursive: true });
      }
      const benchmarksPath = path.join(evalsDir, 'benchmarks.json');
      fs.writeFileSync(benchmarksPath, JSON.stringify(benchmarks, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save benchmarks:', error);
      return false;
    }
  });

  ipcMain.handle('evals:save-failure', async (_event, { rootPath, presetId, failure }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      const failuresDir = path.join(evalsDir, 'failures');
      if (!fs.existsSync(failuresDir)) {
        fs.mkdirSync(failuresDir, { recursive: true });
      }
      const filePath = path.join(failuresDir, `failure-${assertSafeId(failure.id, 'failure id')}.json`);
      fs.writeFileSync(filePath, JSON.stringify(failure, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save failure case:', error);
      return false;
    }
  });

  ipcMain.handle('evals:delete-failure', async (_event, { rootPath, presetId, failureId }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      const filePath = path.join(evalsDir, 'failures', `failure-${assertSafeId(failureId, 'failureId')}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete failure case:', error);
      return false;
    }
  });

  ipcMain.handle('evals:save-regression-history', async (_event, { rootPath, presetId, history }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      if (!fs.existsSync(evalsDir)) {
        fs.mkdirSync(evalsDir, { recursive: true });
      }
      const runsPath = path.join(evalsDir, 'regression_runs.json');
      fs.writeFileSync(runsPath, JSON.stringify(history, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save regression runs history:', error);
      return false;
    }
  });

  ipcMain.handle('evals:save-gold-standard', async (_event, { rootPath, presetId, item }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      const goldStandardsDir = path.join(evalsDir, 'gold-standards');
      if (!fs.existsSync(goldStandardsDir)) {
        fs.mkdirSync(goldStandardsDir, { recursive: true });
      }
      const filePath = path.join(goldStandardsDir, `gold-${assertSafeId(item.id, 'gold standard id')}.json`);
      fs.writeFileSync(filePath, JSON.stringify(item, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save gold standard:', error);
      return false;
    }
  });

  ipcMain.handle('evals:delete-gold-standard', async (_event, { rootPath, presetId, id }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      const filePath = path.join(evalsDir, 'gold-standards', `gold-${assertSafeId(id, 'gold standard id')}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete gold standard:', error);
      return false;
    }
  });

  ipcMain.handle('evals:save-judges', async (_event, { rootPath, presetId, list }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      if (!fs.existsSync(evalsDir)) {
        fs.mkdirSync(evalsDir, { recursive: true });
      }
      const filePath = path.join(evalsDir, 'judges.json');
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save judges list:', error);
      return false;
    }
  });

  ipcMain.handle('evals:save-promotions', async (_event, { rootPath, presetId, list }) => {
    try {
      const evalsDir = getEvalsDir(rootPath, presetId);
      if (!fs.existsSync(evalsDir)) {
        fs.mkdirSync(evalsDir, { recursive: true });
      }
      const filePath = path.join(evalsDir, 'promotions.json');
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save promotions list:', error);
      return false;
    }
  });
}
