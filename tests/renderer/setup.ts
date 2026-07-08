import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount any mounted component trees between tests so jsdom stays clean.
// (window.api is installed/reset per-test by installWindowApiStub() — see
// tests/renderer/windowApiStub.ts — not here, so each suite controls its own
// stub instance.)
afterEach(() => {
  cleanup();
});
