import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/lib/manifestValidation';

function baseManifest(overrides: Record<string, any> = {}) {
  return {
    schemaVersion: 'agentdeck.workspace.v2',
    id: 'my-workspace',
    name: 'My Workspace',
    previewUrl: 'http://localhost:5173',
    terminals: [{ name: 'PowerShell', shell: 'powershell.exe' }],
    ...overrides,
  };
}

const fields = (r: ReturnType<typeof validateManifest>) => r.errors.map((e) => e.field);

describe('validateManifest — core required fields', () => {
  it('accepts a minimal valid manifest', () => {
    const result = validateManifest(baseManifest());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a null/undefined config with a root error', () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
    expect(fields(result)).toContain('root');
  });

  it('rejects a wrong schema version', () => {
    const result = validateManifest(baseManifest({ schemaVersion: 'agentdeck.workspace.v1' }));
    expect(fields(result)).toContain('schemaVersion');
  });

  it('rejects an id with illegal characters', () => {
    const result = validateManifest(baseManifest({ id: 'My Workspace!' }));
    expect(fields(result)).toContain('id');
  });

  it('rejects a missing name', () => {
    const result = validateManifest(baseManifest({ name: '   ' }));
    expect(fields(result)).toContain('name');
  });
});

describe('validateManifest — previewUrl policy', () => {
  it('rejects an external preview URL', () => {
    const result = validateManifest(baseManifest({ previewUrl: 'http://example.com' }));
    expect(fields(result)).toContain('previewUrl');
  });

  it('accepts 127.0.0.1', () => {
    const result = validateManifest(baseManifest({ previewUrl: 'http://127.0.0.1:8000' }));
    expect(result.valid).toBe(true);
  });

  // Documents the audit's weak-URL finding: prefix matching lets a lookalike host
  // through. Baseline for a future hardening of the previewUrl check.
  it('KNOWN weakness: allows a "localhost.evil.com" lookalike host', () => {
    const result = validateManifest(baseManifest({ previewUrl: 'http://localhost.evil.com/' }));
    expect(fields(result)).not.toContain('previewUrl');
  });
});

describe('validateManifest — terminals', () => {
  it('requires the terminals section', () => {
    const m = baseManifest();
    delete (m as any).terminals;
    expect(fields(validateManifest(m))).toContain('terminals');
  });

  it('requires at least one terminal', () => {
    expect(fields(validateManifest(baseManifest({ terminals: [] })))).toContain('terminals');
  });

  it('requires name and shell on each terminal', () => {
    const result = validateManifest(baseManifest({ terminals: [{ name: '', shell: '' }] }));
    expect(fields(result)).toContain('terminals[0].name');
    expect(fields(result)).toContain('terminals[0].shell');
  });
});

describe('validateManifest — services & quick actions', () => {
  it('flags duplicate service IDs', () => {
    const result = validateManifest(
      baseManifest({
        services: [
          { id: 'api', label: 'API', command: 'npm start', shell: 'powershell.exe' },
          { id: 'api', label: 'API 2', command: 'npm start', shell: 'powershell.exe' },
        ],
      })
    );
    expect(fields(result)).toContain('services[1].id');
  });

  it('flags a startService action that targets a non-existent service', () => {
    const result = validateManifest(
      baseManifest({
        services: [{ id: 'api', label: 'API', command: 'npm start', shell: 'powershell.exe' }],
        quickActions: [{ id: 'go', label: 'Go', type: 'startService', serviceId: 'ghost' }],
      })
    );
    expect(fields(result)).toContain('quickActions[0].serviceId');
  });

  it('rejects an invalid action type', () => {
    const result = validateManifest(
      baseManifest({ quickActions: [{ id: 'x', label: 'X', type: 'launchRocket' }] })
    );
    expect(fields(result)).toContain('quickActions[0].type');
  });
});

describe('validateManifest — evals', () => {
  it('rejects a baseline threshold outside 0..1', () => {
    const result = validateManifest(baseManifest({ evals: { baselineThreshold: 2 } }));
    expect(fields(result)).toContain('evals.baselineThreshold');
  });

  it('accepts a valid baseline threshold', () => {
    const result = validateManifest(baseManifest({ evals: { baselineThreshold: 0.8, script: 'npm test' } }));
    expect(result.valid).toBe(true);
  });
});
