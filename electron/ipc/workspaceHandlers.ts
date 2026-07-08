import type { IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { isWorkspaceRootSafe } from '../../src/lib/pathSafety';
import { validateManifest } from '../../src/lib/manifestValidation';
import { scanAgentTopologyInternal } from '../../src/lib/topologyScanner';
import type { addSystemLogInternal as addSystemLogFn } from '../logger';

/**
 * Workspace-domain IPC handlers (workspace:load-path / check-config /
 * initialize / save / scanAgentTopology). Relocated verbatim from
 * electron/main.ts (W5.1 — main-process final closure) as a behavior-preserving
 * change: the manifest load/check, the template wizard (vite/fastapi/static/
 * custom), manifest validation, timestamped-backup + atomic write, and topology
 * scan are all unchanged. The only mechanical edit is the module constant
 * WORKSPACES_DIR -> the injected `workspacesDir`.
 *
 * Dependencies: `workspacesDir` (the former WORKSPACES_DIR constant) and
 * `addSystemLogInternal` are injected; the pure libs isWorkspaceRootSafe /
 * validateManifest / scanAgentTopologyInternal and node fs/path are imported
 * directly. The block never reads mainWindow/dialog/BrowserWindow/DATA_DIR/
 * checksum helpers/path resolvers. All five channels use ipcMain.handle.
 */
export interface WorkspaceHandlerDeps {
  ipcMain: IpcMain;
  workspacesDir: string;
  addSystemLogInternal: typeof addSystemLogFn;
}

export function registerWorkspaceHandlers(deps: WorkspaceHandlerDeps): void {
  const { ipcMain, workspacesDir, addSystemLogInternal } = deps;

  // --- Dynamic Workspace Loader (.agentdeck/workspace.json) ---
  ipcMain.handle('workspace:load-path', async (_event, folderPath: string) => {
    try {
      if (!isWorkspaceRootSafe(folderPath)) return null;
      const configPath = path.join(folderPath, '.agentdeck', 'workspace.json');
      if (!fs.existsSync(configPath)) {
        return null;
      } else {
        const data = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(data);
        config.rootPath = folderPath;
        return config;
      }
    } catch (error) {
      console.error('Failed to load path workspace:', error);
      return null;
    }
  });

  // --- Dynamic Workspace Manifest Editor & Wizard Operations ---
  ipcMain.handle('workspace:check-config', async (_event, folderPath: string) => {
    try {
      if (!isWorkspaceRootSafe(folderPath)) return { exists: false };
      const configPath = path.join(folderPath, '.agentdeck', 'workspace.json');
      return { exists: fs.existsSync(configPath) };
    } catch (e) {
      console.error(e);
      return { exists: false };
    }
  });

  ipcMain.handle('workspace:initialize', async (_event, { folderPath, name, previewUrl, templateId }) => {
    try {
      if (!isWorkspaceRootSafe(folderPath)) {
        return { success: false, error: 'Invalid workspace folder. Select an existing absolute folder (no relative, empty, or ".." paths).' };
      }
      const agentdeckDir = path.join(folderPath, '.agentdeck');
      const configPath = path.join(agentdeckDir, 'workspace.json');

      if (!fs.existsSync(agentdeckDir)) {
        fs.mkdirSync(agentdeckDir, { recursive: true });
      }

      let services: any[] = [];
      let quickActions: any[] = [];

      if (templateId === 'vite') {
        services = [
          {
            id: 'frontend',
            label: 'Frontend Dev',
            shell: 'powershell.exe',
            command: 'npm run dev',
            cwd: '.'
          }
        ];
        quickActions = [
          {
            id: 'open-folder',
            label: 'Open Folder',
            type: 'openFolder'
          },
          {
            id: 'open-preview',
            label: 'Open Preview',
            type: 'previewUrl',
            url: previewUrl
          }
        ];
      } else if (templateId === 'fastapi') {
        services = [
          {
            id: 'backend',
            label: 'API Backend',
            shell: 'powershell.exe',
            command: 'uvicorn main:app --reload',
            cwd: '.'
          }
        ];
        quickActions = [
          {
            id: 'open-folder',
            label: 'Open Folder',
            type: 'openFolder'
          },
          {
            id: 'open-preview',
            label: 'Open Preview',
            type: 'previewUrl',
            url: previewUrl
          }
        ];
      } else if (templateId === 'static') {
        services = [
          {
            id: 'webserver',
            label: 'Static Webserver',
            shell: 'powershell.exe',
            command: 'npx -y serve',
            cwd: '.'
          }
        ];
        quickActions = [
          {
            id: 'open-folder',
            label: 'Open Folder',
            type: 'openFolder'
          }
        ];
      } else { // 'custom' or empty
        quickActions = [
          {
            id: 'open-folder',
            label: 'Open Folder',
            type: 'openFolder'
          }
        ];
      }

      const id = path.basename(folderPath).toLowerCase().replace(/[^a-z0-9]/g, '-');

      const newWorkspace = {
        schemaVersion: "agentdeck.workspace.v2",
        id,
        name,
        rootPath: folderPath,
        previewUrl,
        health: {
          type: 'http',
          url: previewUrl
        },
        services,
        quickActions,
        terminals: [
          {
            name: 'PowerShell',
            shell: 'powershell.exe',
            cwd: folderPath
          }
        ]
      };

      fs.writeFileSync(configPath, JSON.stringify(newWorkspace, null, 2), 'utf-8');
      addSystemLogInternal(`MANIFEST_SAVED: Initialized new workspace configuration at "${configPath}"`, 'success', id);
      return { success: true, workspace: newWorkspace };
    } catch (error: any) {
      console.error('Failed to initialize workspace:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('workspace:save', async (_event, { id, rootPath, config }) => {
    try {
      // A. Validate config
      const valResult = validateManifest(config);
      if (!valResult.valid) {
        const errorList = valResult.errors.map(e => `${e.field}: ${e.message}`).join(', ');
        return { success: false, error: `Validation failed: ${errorList}` };
      }

      // Determine destination path
      let configPath = '';
      const presetIds = ['tm4', 'sound-machina', 'robotstore'];
      if (presetIds.includes(id)) {
        configPath = path.join(workspacesDir, `${id}.json`);
      } else if (rootPath) {
        // Dynamic discovered workspace
        if (!isWorkspaceRootSafe(rootPath)) {
          return { success: false, error: 'Invalid workspace folder. Select an existing absolute folder (no relative, empty, or ".." paths).' };
        }
        configPath = path.join(rootPath, '.agentdeck', 'workspace.json');
      } else {
        return { success: false, error: 'Target workspace root path is missing.' };
      }

      // Ensure directory exists
      const agentdeckDir = path.dirname(configPath);
      if (!fs.existsSync(agentdeckDir)) {
        fs.mkdirSync(agentdeckDir, { recursive: true });
      }

      // B. Backup previous manifest if exists, with YYYYMMDD-HHMM timestamp
      if (fs.existsSync(configPath)) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');

        const backupPath = `${configPath}.bak-${yyyy}${mm}${dd}-${hh}${min}`;
        fs.copyFileSync(configPath, backupPath);
      }

      // C. Write atomically
      const tempPath = `${configPath}.tmp-${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');

      // Rename/overwrite atomically
      fs.renameSync(tempPath, configPath);

      addSystemLogInternal(`MANIFEST_SAVED: Visual configuration saved for "${config.name}"`, 'success', id);
      return { success: true, workspace: config };
    } catch (error: any) {
      console.error('Failed to save workspace config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('workspace:scanAgentTopology', async (_event, rootPath: string) => {
    try {
      return scanAgentTopologyInternal(rootPath);
    } catch (error: any) {
      console.error('Failed to scan workspace:', error);
      throw error;
    }
  });
}
