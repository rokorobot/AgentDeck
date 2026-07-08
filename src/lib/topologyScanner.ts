import * as fs from 'fs';
import * as path from 'path';
import { AgentTopologySuggestion, SuggestedAgent } from '../types/agent';

export function scanAgentTopologyInternal(rootPath: string): AgentTopologySuggestion {
  if (!rootPath || typeof rootPath !== 'string') {
    throw new Error('Workspace root path is required.');
  }
  const resolvedRoot = path.resolve(rootPath);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Workspace root path does not exist: ${rootPath}`);
  }

  const safeResolve = (targetRelativePath: string): string => {
    const resolvedTarget = path.resolve(resolvedRoot, targetRelativePath);
    const relative = path.relative(resolvedRoot, resolvedTarget);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Access denied: path escapes workspace root: ${targetRelativePath}`);
    }
    return resolvedTarget;
  };

  const hasDir = (relPath: string): boolean => {
    try {
      const p = safeResolve(relPath);
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  };

  const hasFile = (relPath: string): boolean => {
    try {
      const p = safeResolve(relPath);
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };

  const findFilesInDir = (relDir: string, filterFn: (name: string) => boolean): boolean => {
    try {
      const dirPath = safeResolve(relDir);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return false;
      const files = fs.readdirSync(dirPath);
      return files.some(filterFn);
    } catch {
      return false;
    }
  };

  // Safe manifest readings
  let packageJson: any = null;
  if (hasFile('package.json')) {
    try {
      const content = fs.readFileSync(safeResolve('package.json'), 'utf8');
      packageJson = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse package.json:', e);
    }
  }

  const hasElectronInPackage = !!(packageJson && (
    (packageJson.dependencies && packageJson.dependencies.electron) ||
    (packageJson.devDependencies && packageJson.devDependencies.electron) ||
    (packageJson.scripts && Object.values(packageJson.scripts).some((s: any) => typeof s === 'string' && s.includes('electron')))
  ));

  const hasReactInPackage = !!(packageJson && (
    (packageJson.dependencies && packageJson.dependencies.react) ||
    (packageJson.devDependencies && packageJson.devDependencies.react)
  ));

  const hasTestScript = !!(packageJson && packageJson.scripts && packageJson.scripts.test);

  // Specific file checks
  let hasElectronInMainTs = false;
  if (hasFile('main.ts')) {
    try {
      const content = fs.readFileSync(safeResolve('main.ts'), 'utf8');
      if (content.includes('electron')) {
        hasElectronInMainTs = true;
      }
    } catch {}
  }

  let hasFastApiRef = false;
  const checkFastApiContent = (filePath: string) => {
    if (hasFile(filePath)) {
      try {
        const content = fs.readFileSync(safeResolve(filePath), 'utf8');
        if (content.toLowerCase().includes('fastapi')) {
          hasFastApiRef = true;
        }
      } catch {}
    }
  };
  checkFastApiContent('pyproject.toml');
  checkFastApiContent('requirements.txt');
  checkFastApiContent('app.py');
  checkFastApiContent('main.py');
  checkFastApiContent('backend/app.py');
  checkFastApiContent('backend/main.py');

  const hasTsx = hasFile('frontend/index.tsx') ||
                 findFilesInDir('src', name => name.endsWith('.tsx')) ||
                 findFilesInDir('frontend', name => name.endsWith('.tsx')) ||
                 findFilesInDir('', name => name.endsWith('.tsx'));

  const hasTestPy = findFilesInDir('tests', name => name.startsWith('test_') && name.endsWith('.py')) ||
                    findFilesInDir('', name => name.startsWith('test_') && name.endsWith('.py'));

  const hasTestTs = findFilesInDir('tests', name => name.endsWith('.test.ts') || name.endsWith('.spec.ts')) ||
                    findFilesInDir('', name => name.endsWith('.test.ts') || name.endsWith('.spec.ts'));

  const detectedFrom: string[] = [];
  const suggestedAgents: SuggestedAgent[] = [];

  // Rule 1: Electron Runtime Agent
  const isElectron = hasDir('electron') || hasFile('electron/main.ts') || hasFile('electron/preload.ts') || hasElectronInMainTs || hasElectronInPackage;
  if (isElectron) {
    detectedFrom.push('Electron app');
    suggestedAgents.push({
      id: 'electron_runtime_agent',
      name: 'Electron Runtime Agent',
      role: 'Maintains Electron main process, preload layer, app lifecycle, windows, IPC safety, and runtime diagnostics.',
      reason: 'Detected Electron project structure (electron folder, config, or package dependency).',
      tools: ['terminal', 'files', 'logs'],
      modelBinding: {
        provider: 'openai',
        model: 'gpt-5.5'
      }
    });
  }

  // Rule 2: React UI Agent
  const isVite = findFilesInDir('', name => name.startsWith('vite.config.')) ||
                 !!(packageJson && (
                   (packageJson.dependencies && packageJson.dependencies.vite) ||
                   (packageJson.devDependencies && packageJson.devDependencies.vite)
                 ));
  const isReact = hasDir('src') || hasDir('frontend') || isVite || hasReactInPackage || hasTsx;
  if (isReact) {
    detectedFrom.push('React frontend');
    if (isVite) {
      detectedFrom.push('Vite project');
    }
    suggestedAgents.push({
      id: 'react_ui_agent',
      name: 'React UI Agent',
      role: 'Maintains React interface, dashboard components, modal flows, state wiring, and user-facing workspace screens.',
      reason: 'Detected React frontend files, Vite config, or react dependency.',
      tools: ['terminal', 'browser', 'files'],
      modelBinding: {
        provider: 'anthropic',
        model: 'claude-sonnet'
      }
    });
  }

  // TS checking
  const hasTsConfig = hasFile('tsconfig.json');
  const hasTypeScriptInPackage = !!(packageJson && (
    (packageJson.dependencies && packageJson.dependencies.typescript) ||
    (packageJson.devDependencies && packageJson.devDependencies.typescript)
  ));
  const hasTsFiles = hasTsConfig || hasTypeScriptInPackage ||
                     findFilesInDir('src', name => name.endsWith('.ts') || name.endsWith('.tsx')) ||
                     findFilesInDir('frontend', name => name.endsWith('.ts') || name.endsWith('.tsx')) ||
                     findFilesInDir('', name => name.endsWith('.ts') || name.endsWith('.tsx'));

  if (hasTsFiles) {
    detectedFrom.push('TypeScript');
  }

  // Rule 3: Testing Agent
  const isTesting = hasDir('tests') || hasTestPy || hasTestTs || hasTestScript || hasFile('pytest.ini');
  if (isTesting) {
    detectedFrom.push('Test scripts');
    suggestedAgents.push({
      id: 'testing_agent',
      name: 'Testing Agent',
      role: 'Reviews test coverage, proposes verification scenarios, tracks acceptance criteria, and validates release boundaries.',
      reason: 'Detected test folder, test spec files, or test scripts configured in package.json.',
      tools: ['terminal', 'files', 'git'],
      modelBinding: {
        provider: 'openai',
        model: 'gpt-5.5'
      }
    });
  }

  // Rule 4: Documentation Agent
  const isDocs = hasDir('docs') || hasFile('README.md') || hasFile('PROJECT_STATE.md') || hasFile('DECISIONS.md') || hasFile('architecture.md');
  if (isDocs) {
    detectedFrom.push('Documentation folder');
    suggestedAgents.push({
      id: 'documentation_agent',
      name: 'Documentation Agent',
      role: 'Maintains project state, release notes, architecture docs, and decision records.',
      reason: 'Detected project documentation folder or design markdown files.',
      tools: ['files'],
      modelBinding: {
        provider: 'openai',
        model: 'gpt-5.5'
      }
    });
  }

  // Rule 5: Backend Agent
  const isBackend = hasDir('backend') || hasFile('app.py') || hasFile('main.py') || hasFile('pyproject.toml') || hasFile('requirements.txt') || hasFastApiRef;
  if (isBackend) {
    detectedFrom.push('Backend code');
    suggestedAgents.push({
      id: 'backend_agent',
      name: 'Backend Agent',
      role: 'Maintains API routes, backend services, persistence, validation, and server-side architecture.',
      reason: 'Detected backend directory, Python files, FastAPI reference, or dependency configuration.',
      tools: ['terminal', 'files', 'logs'],
      modelBinding: {
        provider: 'openai',
        model: 'gpt-5.5'
      }
    });
  }

  // Calculate confidence
  let confidence: 'low' | 'medium' | 'high' = 'low';
  const isHighElectron = hasDir('electron');
  if (suggestedAgents.length >= 3 || isHighElectron) {
    confidence = 'high';
  } else if (suggestedAgents.length > 0) {
    confidence = 'medium';
  }

  // If Electron agent specifically, set confidence rules
  const electronAgent = suggestedAgents.find(a => a.id === 'electron_runtime_agent');
  if (electronAgent) {
    if (!isHighElectron) {
      if (suggestedAgents.length < 3) {
        confidence = 'medium';
      }
    }
  }

  const workspaceId = path.basename(rootPath);

  return {
    id: `suggest_${crypto.randomUUID()}`,
    workspaceId,
    detectedFrom,
    confidence,
    suggestedAgents,
    createdAt: new Date().toISOString()
  };
}
