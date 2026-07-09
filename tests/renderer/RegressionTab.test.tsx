import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegressionTab } from '../../src/components/evaluations/RegressionTab';

// W6-1 part 2: render test for the extracted presentational Regression tab.
// Pins visible content (header, run rows, empty/loading states) and the
// callback contracts the shell relies on (run, promote, report toggle).
// Pure component — no store, no window.api.

const benchmarks: any[] = [
  { id: 'b1', name: 'Prompt Quality', criteria: [], baselineScore: 0.87, testCases: [] },
];

const runs: any[] = [
  {
    id: 'run-1', benchmarkId: 'b1', status: 'regression_detected', diff: -0.05,
    baselineScore: 0.87, score: 0.82, triggerContext: 'Prompt Engine Update',
    isSimulated: true, isApproved: false, timestamp: '2026-01-01T00:00:00.000Z',
  },
];

function baseProps(overrides: Record<string, any> = {}) {
  return {
    benchmarks,
    regressionRuns: runs,
    isRunningBenchmark: false,
    evalScript: null,
    selectedBenchmarkId: 'b1',
    selectedRunIdForReport: null,
    onSelectBenchmark: vi.fn(),
    onRunRegression: vi.fn(),
    onPromoteBaseline: vi.fn(),
    onToggleReport: vi.fn(),
    ...overrides,
  };
}

describe('RegressionTab', () => {
  it('renders the pipeline header and run history', () => {
    render(<RegressionTab {...baseProps()} />);
    expect(screen.getByText('Regression Run Pipeline')).toBeInTheDocument();
    expect(screen.getByText('RUN REGRESSION SET')).toBeInTheDocument();
    expect(screen.getByText(/Prompt Engine Update/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no runs', () => {
    render(<RegressionTab {...baseProps({ regressionRuns: [] })} />);
    expect(screen.getByText(/No evaluations history recorded yet/i)).toBeInTheDocument();
  });

  it('shows the evaluating/loading state when isRunningBenchmark', () => {
    render(<RegressionTab {...baseProps({ isRunningBenchmark: true })} />);
    expect(screen.getByText('EVALUATING...')).toBeInTheDocument();
    expect(screen.getByText(/Deploying test prompt instances/i)).toBeInTheDocument();
  });

  it('fires onRunRegression when the run button is clicked', () => {
    const onRunRegression = vi.fn();
    render(<RegressionTab {...baseProps({ onRunRegression })} />);
    fireEvent.click(screen.getByText('RUN REGRESSION SET'));
    expect(onRunRegression).toHaveBeenCalledTimes(1);
  });

  it('fires onPromoteBaseline with (benchmarkId, runId) when Promote Baseline is clicked', () => {
    const onPromoteBaseline = vi.fn();
    // run.score (0.82) !== benchmark baseline (0.87) -> Promote button rendered.
    render(<RegressionTab {...baseProps({ onPromoteBaseline })} />);
    fireEvent.click(screen.getByText('Promote Baseline'));
    expect(onPromoteBaseline).toHaveBeenCalledWith('b1', 'run-1');
  });
});
