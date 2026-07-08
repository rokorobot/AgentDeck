import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BenchmarksTab } from '../../src/components/evaluations/BenchmarksTab';

// W6-1 part 1: render test for the extracted presentational Benchmarks tab.
// Pins the visible content + the "Run Suite" callback contract the shell relies
// on. Pure component — no store, no window.api.

const sampleBenchmarks: any[] = [
  { id: 'b1', name: 'Prompt Quality', description: 'Checks prompts', criteria: ['Clarity', 'Novelty'], baselineScore: 0.87, goldStandardsCount: 15, testCases: [] },
  { id: 'b2', name: 'Governance Suite', description: '', criteria: ['Compliance'], baselineScore: 0.95, testCases: [] },
];

describe('BenchmarksTab', () => {
  it('renders a card per benchmark with name + baseline', () => {
    render(<BenchmarksTab benchmarks={sampleBenchmarks} onRunSuite={vi.fn()} />);
    expect(screen.getByText('Prompt Quality')).toBeInTheDocument();
    expect(screen.getByText('Governance Suite')).toBeInTheDocument();
    expect(screen.getByText('0.87')).toBeInTheDocument();
    expect(screen.getByText('Clarity')).toBeInTheDocument();
  });

  it('shows the empty state when there are no benchmarks', () => {
    render(<BenchmarksTab benchmarks={[]} onRunSuite={vi.fn()} />);
    expect(screen.getByText(/No active benchmarks defined/i)).toBeInTheDocument();
  });

  it('fires onRunSuite with the benchmark id when "Run Suite" is clicked', () => {
    const onRunSuite = vi.fn();
    render(<BenchmarksTab benchmarks={sampleBenchmarks} onRunSuite={onRunSuite} />);
    const runButtons = screen.getAllByText('Run Suite');
    fireEvent.click(runButtons[0]);
    expect(onRunSuite).toHaveBeenCalledWith('b1');
  });
});
