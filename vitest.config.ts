import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest configuration — two projects:
//  - "node": the original Electron-free safety net (pure libs in src/lib + the
//    injected-dependency IPC handler modules in electron/ipc). Unchanged: same
//    node environment and the same tests/**/*.test.ts glob it always used.
//  - "renderer": the W6-0 renderer safety net. jsdom environment + React plugin,
//    scoped strictly to tests/renderer/**/*.test.tsx so it never picks up (or
//    disturbs) the node suite.
//
// `npm test` (vitest run) executes BOTH projects.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          // Keep the renderer tests out of the node project (defensive — they
          // are .tsx so the .ts glob already excludes them).
          exclude: ['tests/renderer/**'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.tsx'],
          setupFiles: ['tests/renderer/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/lib/**/*.ts'],
    },
  },
});
