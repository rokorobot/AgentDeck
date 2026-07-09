import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JudgesDefinitionsTab } from '../../src/components/evaluations/JudgesDefinitionsTab';

// W6-1 part 7 (final): render test for the extracted presentational Judges &
// Definitions tab. Dual-pane component — pins both pane headers, the benchmark
// empty state, a rendered benchmark-spec card + judge card, both add-form
// toggle/submit callback contracts, and the delete-judge callback. Pure
// component: both add-forms' state is owned by the parent shell and passed in.

const benchmarks: any[] = [
  {
    id: 'b1', name: 'Prompt Quality', description: 'Quality suite',
    criteria: ['Melody', 'Genre'], baselineScore: 0.87, testCases: [],
  },
];

const judges: any[] = [
  { id: 'j1', name: 'SunoPromptJudge', criteria: ['clarity', 'genre'], threshold: 0.8 },
];

function baseProps(overrides: Record<string, any> = {}) {
  return {
    benchmarks,
    judges,
    evalThreshold: 0.8,
    isAddingBenchmark: false,
    onToggleAddBenchmark: vi.fn(),
    newBenchmarkName: '',
    onChangeBenchmarkName: vi.fn(),
    newBenchmarkBaseline: 0.8,
    onChangeBenchmarkBaseline: vi.fn(),
    newBenchmarkDesc: '',
    onChangeBenchmarkDesc: vi.fn(),
    newBenchmarkCriteria: '',
    onChangeBenchmarkCriteria: vi.fn(),
    onSubmitAddBenchmark: vi.fn(),
    isAddingJudge: false,
    onToggleAddJudge: vi.fn(),
    newJudgeName: '',
    onChangeJudgeName: vi.fn(),
    newJudgeThreshold: 0.8,
    onChangeJudgeThreshold: vi.fn(),
    newJudgeCriteria: '',
    onChangeJudgeCriteria: vi.fn(),
    onSubmitAddJudge: vi.fn(),
    onDeleteJudge: vi.fn(),
    ...overrides,
  };
}

describe('JudgesDefinitionsTab', () => {
  it('renders both pane headers and a benchmark-spec + judge card', () => {
    render(<JudgesDefinitionsTab {...baseProps()} />);
    expect(screen.getByText('Suite Quality Dimensions')).toBeInTheDocument();
    expect(screen.getByText('Evaluations Judges')).toBeInTheDocument();
    // Benchmark card (left pane) and judge card (right pane).
    expect(screen.getByText('Prompt Quality')).toBeInTheDocument();
    expect(screen.getByText('SunoPromptJudge')).toBeInTheDocument();
  });

  it('shows the benchmark empty state when there are no benchmarks', () => {
    render(<JudgesDefinitionsTab {...baseProps({ benchmarks: [] })} />);
    expect(screen.getByText(/No active benchmarks defined to edit/i)).toBeInTheDocument();
  });

  it('fires onToggleAddBenchmark when Create Benchmark is clicked', () => {
    const onToggleAddBenchmark = vi.fn();
    render(<JudgesDefinitionsTab {...baseProps({ onToggleAddBenchmark })} />);
    fireEvent.click(screen.getByText('Create Benchmark'));
    expect(onToggleAddBenchmark).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleAddJudge when Add Judge is clicked', () => {
    const onToggleAddJudge = vi.fn();
    render(<JudgesDefinitionsTab {...baseProps({ onToggleAddJudge })} />);
    fireEvent.click(screen.getByText('Add Judge'));
    expect(onToggleAddJudge).toHaveBeenCalledTimes(1);
  });

  it('shows the benchmark add-form and submits it when isAddingBenchmark is true', () => {
    const onSubmitAddBenchmark = vi.fn((e) => e.preventDefault());
    // Benchmark Suite Name + Baseline Target are `required`; provide values.
    render(<JudgesDefinitionsTab {...baseProps({
      isAddingBenchmark: true,
      newBenchmarkName: 'A Suite',
      onSubmitAddBenchmark,
    })} />);
    fireEvent.click(screen.getByText('Create Benchmark Spec'));
    expect(onSubmitAddBenchmark).toHaveBeenCalledTimes(1);
  });

  it('shows the judge add-form and submits it when isAddingJudge is true', () => {
    const onSubmitAddJudge = vi.fn((e) => e.preventDefault());
    // Judge Name + Criteria + Threshold are `required`; provide values.
    render(<JudgesDefinitionsTab {...baseProps({
      isAddingJudge: true,
      newJudgeName: 'A Judge',
      newJudgeCriteria: 'clarity',
      onSubmitAddJudge,
    })} />);
    fireEvent.click(screen.getByText('Save Judge Definition'));
    expect(onSubmitAddJudge).toHaveBeenCalledTimes(1);
  });

  it('fires onDeleteJudge with the id when the delete button is clicked', () => {
    const onDeleteJudge = vi.fn();
    render(<JudgesDefinitionsTab {...baseProps({ onDeleteJudge })} />);
    fireEvent.click(screen.getByTitle('Delete Judge'));
    expect(onDeleteJudge).toHaveBeenCalledWith('j1');
  });
});
