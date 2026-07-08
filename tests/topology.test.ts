import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanAgentTopologyInternal } from '../src/lib/topologyScanner';

// The original test depended on a hardcoded, machine-specific folder
// (C:\Users\Robert\AgentDeck_TestWorkspace) and re-implemented component logic
// inline. This version builds a self-contained temp fixture so the scanner is
// tested against real files in a portable, CI-safe way (audit task M0.2).
let fixtureRoot: string;

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-topo-'));

  fs.writeFileSync(
    path.join(fixtureRoot, 'package.json'),
    JSON.stringify({
      name: 'fixture-app',
      scripts: { test: 'vitest run', dev: 'electron .' },
      dependencies: { react: '^18.0.0' },
      devDependencies: { electron: '^30.0.0', vite: '^5.0.0', typescript: '^5.0.0' },
    })
  );
  fs.writeFileSync(path.join(fixtureRoot, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(fixtureRoot, 'README.md'), '# Fixture');

  fs.mkdirSync(path.join(fixtureRoot, 'electron'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'electron', 'main.ts'), "import { app } from 'electron';");

  fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'src', 'App.tsx'), 'export default function App() { return null; }');

  fs.mkdirSync(path.join(fixtureRoot, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'backend', 'app.py'), 'from fastapi import FastAPI');

  fs.mkdirSync(path.join(fixtureRoot, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'tests', 'sample.test.ts'), '// test');

  fs.mkdirSync(path.join(fixtureRoot, 'docs'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('scanAgentTopologyInternal — detection', () => {
  it('derives the workspace id from the folder name', () => {
    const result = scanAgentTopologyInternal(fixtureRoot);
    expect(result.workspaceId).toBe(path.basename(fixtureRoot));
  });

  it('suggests all five agents for a full-stack Electron project', () => {
    const names = scanAgentTopologyInternal(fixtureRoot).suggestedAgents.map((a) => a.name);
    expect(names).toContain('Electron Runtime Agent');
    expect(names).toContain('React UI Agent');
    expect(names).toContain('Testing Agent');
    expect(names).toContain('Documentation Agent');
    expect(names).toContain('Backend Agent');
  });

  it('reports the detection sources it matched', () => {
    const detected = scanAgentTopologyInternal(fixtureRoot).detectedFrom;
    expect(detected).toEqual(
      expect.arrayContaining(['Electron app', 'React frontend', 'Vite project', 'TypeScript', 'Backend code'])
    );
  });

  it('rates confidence high when an electron folder is present', () => {
    expect(scanAgentTopologyInternal(fixtureRoot).confidence).toBe('high');
  });
});

describe('scanAgentTopologyInternal — input guarding', () => {
  it('throws when the root path is empty', () => {
    expect(() => scanAgentTopologyInternal('')).toThrow(/required/i);
  });

  it('throws when the root path does not exist', () => {
    const missing = path.join(fixtureRoot, 'does-not-exist-subdir');
    expect(() => scanAgentTopologyInternal(missing)).toThrow(/does not exist/i);
  });
});

describe('scanAgentTopologyInternal — id generation (audit W1)', () => {
  it('produces distinct suggestion ids across rapid back-to-back scans', () => {
    // Previously `suggest_${Date.now()}` -- two scans in the same millisecond
    // produced identical ids. Now backed by crypto.randomUUID().
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(scanAgentTopologyInternal(fixtureRoot).id);
    }
    expect(ids.size).toBe(50);
  });

  it('still stamps a real, current ISO timestamp on createdAt (untouched non-id behavior)', () => {
    const before = Date.now();
    const result = scanAgentTopologyInternal(fixtureRoot);
    const after = Date.now();
    const createdAtMs = new Date(result.createdAt).getTime();
    expect(createdAtMs).toBeGreaterThanOrEqual(before);
    expect(createdAtMs).toBeLessThanOrEqual(after);
  });
});
