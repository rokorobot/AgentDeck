import { defineConfig } from 'vitest/config';

// Vitest configuration for the audit-remediation safety net.
// Tests target pure, Electron-free logic in src/lib and src/store.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/lib/**/*.ts'],
    },
  },
});
