import type { IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { computeHash, verifyHash } from '../../src/lib/integrityChecksum';

/**
 * Provenance IPC handlers (provenance:load-all / record-mutation / seal) --
 * the first persistence-heavy domain extracted after the W5 PR 5 foundation
 * split. Relocated verbatim from electron/main.ts as a behavior-preserving
 * change: the three handler bodies are unchanged.
 *
 * Dependencies: `getProvenancePath` is injected because it is the DATA_DIR-bound
 * resolver created in main.ts (createWorkspacePaths(DATA_DIR)) -- injecting the
 * already-bound function keeps DATA_DIR single-sourced. The pure checksum
 * helpers computeHash/verifyHash are imported directly from the canonical
 * src/lib/integrityChecksum. `fs`/`path` are node built-ins used as-is. The
 * block never reads mainWindow and logs only via console.error, so nothing else
 * is injected. All three channels use ipcMain.handle (each returns a value).
 */
export interface ProvenanceHandlerDeps {
  ipcMain: IpcMain;
  getProvenancePath: (rootPath: string | null, presetId: string) => string;
}

export function registerProvenanceHandlers(deps: ProvenanceHandlerDeps): void {
  const { ipcMain, getProvenancePath } = deps;

  ipcMain.handle('provenance:load-all', async (_event, { rootPath, presetId }) => {
    try {
      const provenancePath = getProvenancePath(rootPath, presetId);
      if (!fs.existsSync(provenancePath)) {
        return [];
      }
      const content = fs.readFileSync(provenancePath, 'utf-8');
      const data = JSON.parse(content);
      if (!data.records || !Array.isArray(data.records)) {
        return [];
      }

      const list = data.records.map((record: any) => {
        record.integrityStatus = verifyHash(record);
        return record;
      });

      // Sort descending by timestamp
      list.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return list;
    } catch (error) {
      console.error('Failed to load provenance records:', error);
      return [];
    }
  });

  ipcMain.handle('provenance:record-mutation', async (_event, { rootPath, presetId, record }) => {
    try {
      const provenancePath = getProvenancePath(rootPath, presetId);
      const provDir = path.dirname(provenancePath);
      if (!fs.existsSync(provDir)) {
        fs.mkdirSync(provDir, { recursive: true });
      }

      let data: { records: any[] } = { records: [] };
      if (fs.existsSync(provenancePath)) {
        try {
          const content = fs.readFileSync(provenancePath, 'utf-8');
          data = JSON.parse(content);
          if (!data.records || !Array.isArray(data.records)) {
            data = { records: [] };
          }
        } catch (e) {
          console.error('Failed to parse existing provenance file, resetting:', e);
        }
      }

      const hash = computeHash(record);
      record.hash = hash;
      record.integrityStatus = 'verified';

      data.records.unshift(record);

      fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2), 'utf-8');
      return record;
    } catch (error) {
      console.error('Failed to record provenance mutation:', error);
      throw error;
    }
  });

  ipcMain.handle('provenance:seal', async (_event, { rootPath, presetId }) => {
    try {
      const provenancePath = getProvenancePath(rootPath, presetId);
      if (!fs.existsSync(provenancePath)) {
        return { success: false, error: 'No provenance records found.' };
      }
      const content = fs.readFileSync(provenancePath, 'utf-8');
      const data = JSON.parse(content);
      if (!data.records || !Array.isArray(data.records)) {
        return { success: false, error: 'No provenance records array found.' };
      }

      let sealedCount = 0;
      for (const record of data.records) {
        if (!record.hash) {
          record.hash = computeHash(record);
          record.integrityStatus = 'verified';
          sealedCount++;
        }
      }

      if (sealedCount > 0) {
        fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2), 'utf-8');
      }

      return { success: true, sealedCount };
    } catch (error: any) {
      console.error('Failed to seal provenance records:', error);
      return { success: false, error: error.message };
    }
  });
}
