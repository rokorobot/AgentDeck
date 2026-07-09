// Ambient type augmentation for the Electron preload bridge (`window.api`).
//
// Extracted verbatim from src/store/workspaceStore.ts (W6-3 p0) so the store
// file shrinks to runtime code ahead of slice decomposition. This is a
// type-only module: it imports the two named types the bridge references and
// augments the global `Window` interface. Because it lives under `src` (which
// tsconfig `include`s) and is a module (has an import + `export {}`), the
// `declare global` block augments — rather than replaces — the global scope,
// exactly as it did inline. No runtime code, no behavior change.
import type { Workspace, ManagedProcess } from './workspace';

declare global {
  interface Window {
    api: {
      workspaces: {
        loadAll(): Promise<Workspace[]>;
        load(id: string): Promise<Workspace | null>;
        openDirectory(): Promise<string | null>;
        loadFromPath(path: string): Promise<Workspace | null>;
        checkConfig(path: string): Promise<{ exists: boolean }>;
        initialize(folderPath: string, name: string, previewUrl: string, templateId: string): Promise<{ success: boolean; error?: string; workspace?: Workspace }>;
        save(id: string, rootPath: string, config: any): Promise<{ success: boolean; error?: string; workspace?: Workspace }>;
      };
      layout: {
        save(layout: any): Promise<boolean>;
        load(): Promise<any>;
      };
      logs: {
        save(logs: any[]): Promise<boolean>;
        load(): Promise<any[]>;
        add(logEntry: any): Promise<any>;
        onLogsChanged(callback: () => void): () => void;
      };
      ollama: {
        checkStatus(): Promise<{ running: boolean; models: string[] }>;
      };
      ports: {
        checkHealth(url: string): Promise<{ online: boolean }>;
      };
      process: {
        start(workspaceId: string, command: any, cwd: string): Promise<ManagedProcess>;
        stop(runId: string): Promise<boolean>;
        restart(runId: string): Promise<ManagedProcess | null>;
        list(): Promise<ManagedProcess[]>;
        onStateChanged(callback: (processes: ManagedProcess[]) => void): () => void;
      };
      ide: {
        open(ide: string, folderPath: string): Promise<{ success: boolean; error?: string }>;
      };
      terminal: {
        create(
          id: string,
          shell: string,
          args: string[],
          cwd: string,
          cols: number,
          rows: number
        ): Promise<{ id: string; type: string }>;
        write(id: string, data: string): void;
        resize(id: string, cols: number, rows: number): void;
        kill(id: string): Promise<boolean>;
        onData(id: string, callback: (data: string) => void): () => void;
        onExit(id: string, callback: (code: number) => void): () => void;
        onFallbackRecreated(id: string, callback: () => void): () => void;
      };
      safety: {
        approveCommand(command: string): Promise<boolean>;
      };
      evals: {
        loadData(rootPath: string | null, presetId: string): Promise<{ benchmarks: any[]; runs: any[]; failures: any[]; goldStandards: any[]; judges: any[]; promotions: any[] }>;
        saveBenchmarks(rootPath: string | null, presetId: string, benchmarks: any[]): Promise<boolean>;
        saveFailure(rootPath: string | null, presetId: string, failure: any): Promise<boolean>;
        deleteFailure(rootPath: string | null, presetId: string, failureId: string): Promise<boolean>;
        saveRegressionHistory(rootPath: string | null, presetId: string, history: any[]): Promise<boolean>;
        saveGoldStandard(rootPath: string | null, presetId: string, item: any): Promise<boolean>;
        deleteGoldStandard(rootPath: string | null, presetId: string, id: string): Promise<boolean>;
        saveJudges(rootPath: string | null, presetId: string, list: any[]): Promise<boolean>;
        savePromotions(rootPath: string | null, presetId: string, list: any[]): Promise<boolean>;
      };
      timeline: {
        loadEvents(rootPath: string | null, presetId: string): Promise<any[]>;
        saveEvent(rootPath: string | null, presetId: string, event: any): Promise<boolean>;
      };
      governance: {
        loadData(rootPath: string | null, presetId: string): Promise<{ policies: any; releaseCandidates: any[] }>;
        savePolicies(rootPath: string | null, presetId: string, policies: any): Promise<boolean>;
        saveCandidates(rootPath: string | null, presetId: string, list: any[]): Promise<boolean>;
      };
      snapshots: {
        loadAll(rootPath: string | null, presetId: string): Promise<any[]>;
        create(rootPath: string | null, presetId: string, description: string, type: string, payload: any, parentSnapshotId?: string): Promise<any>;
        restore(rootPath: string | null, presetId: string, snapshotId: string): Promise<{ success: boolean; error?: string }>;
        loadPayload(rootPath: string | null, presetId: string, snapshotId: string): Promise<any>;
      };
      provenance: {
        loadAll(rootPath: string | null, presetId: string): Promise<any[]>;
        recordMutation(rootPath: string | null, presetId: string, record: any): Promise<any>;
        seal(rootPath: string | null, presetId: string): Promise<{ success: boolean; sealedCount?: number; error?: string }>;
      };
      doctor: {
        runChecks(rootPath: string | null, presetId: string): Promise<any>;
        repair(rootPath: string | null, presetId: string, checkId: string): Promise<{ success: boolean; error?: string }>;
        exportDiagnosticBundle(rootPath: string | null, presetId: string): Promise<{ success: boolean; error?: string }>;
      };
      dep: {
        generate(rootPath: string | null, presetId: string, candidateId: string): Promise<any>;
        signAndSave(
          rootPath: string | null,
          presetId: string,
          dep: any,
          decisionRationale: string,
          decisionClass: string,
          overrideReason?: string
        ): Promise<{ success: boolean; dep?: any; error?: string }>;
        loadAll(rootPath: string | null, presetId: string): Promise<any[]>;
        verify(rootPath: string | null, presetId: string, depId: string): Promise<any>;
        exportJson(rootPath: string | null, presetId: string, depId: string): Promise<{ success: boolean; filePath?: string; error?: string }>;
        exportMarkdown(rootPath: string | null, presetId: string, depId: string): Promise<{ success: boolean; filePath?: string; error?: string }>;
      };
    };
  }
}

export {};
