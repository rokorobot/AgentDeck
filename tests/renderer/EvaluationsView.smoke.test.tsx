import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { installWindowApiStub } from './windowApiStub';

// W6-0 SMOKE CHARACTERIZATION for src/components/EvaluationsView.tsx.
//
// Pins that the 1,383-line view mounts in jsdom against the window.api stub
// without crashing on missing Electron globals, renders its tab shell, and
// never reaches past the stubbed IPC boundary. This is the render-safety gate
// for the future per-tab component extraction (W6-1). Runtime source unchanged.

let api: ReturnType<typeof installWindowApiStub>;

beforeEach(() => {
  vi.resetModules();
  api = installWindowApiStub();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderView(props: Record<string, any> = {}) {
  const { EvaluationsView } = await import('../../src/components/EvaluationsView');
  return render(<EvaluationsView {...props} />);
}

describe('EvaluationsView — smoke', () => {
  it('mounts in jsdom without a runtime crash and shows the tab shell', async () => {
    await renderView();
    // Default sub-tab is "benchmarks"; the Benchmarks tab label is part of the shell.
    expect(screen.getByText('Benchmarks')).toBeInTheDocument();
  });

  it('renders representative tab labels from the shell', async () => {
    await renderView();
    // Labels sourced from the inventory (tab row): Failure Library + Gold Standards.
    expect(screen.getByText('Failure Library')).toBeInTheDocument();
    expect(screen.getByText('Gold Standards')).toBeInTheDocument();
  });

  it('does not reach past the window.api stub during render (no un-stubbed IPC)', async () => {
    await renderView();
    // window.api is fully stubbed; any IPC the view triggers is captured here.
    // A plain render must not have thrown, and the stub object is intact.
    expect((globalThis as any).window.api).toBe(api);
    // Sanity: render did not invoke a mutating IPC write during mount.
    expect(api.evals.saveBenchmarks).not.toHaveBeenCalled();
    expect(api.governance.savePolicies).not.toHaveBeenCalled();
  });
});
