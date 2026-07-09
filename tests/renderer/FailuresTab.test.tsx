import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FailuresTab } from '../../src/components/evaluations/FailuresTab';

// W6-1 part 4: render test for the extracted presentational Failure Library tab.
// Pins the visible content (header, add-failure form toggle, failure card, empty
// state) and the callback contracts the shell relies on (delete, convert toggle,
// add-failure submit, conversion submit). Pure component — all state is owned by
// the parent shell and passed in as props.

const benchmarks: any[] = [
  { id: 'b1', name: 'Prompt Quality', criteria: [], baselineScore: 0.87, testCases: [] },
];

const failures: any[] = [
  {
    id: 'fail-1', benchmarkId: 'b1', prompt: 'Coldwave track prompt',
    expected: 'A cold synthwave track', actual: 'A trance track',
    failureDescription: 'Output contains trance synths', resolved: false,
    timestamp: '2026-01-01T00:00:00.000Z',
  },
];

function baseProps(overrides: Record<string, any> = {}) {
  return {
    failures,
    benchmarks,
    isAddingFailure: false,
    onToggleAddFailure: vi.fn(),
    newFailurePrompt: '',
    onChangeFailurePrompt: vi.fn(),
    newFailureExpected: '',
    onChangeFailureExpected: vi.fn(),
    newFailureActual: '',
    onChangeFailureActual: vi.fn(),
    newFailureDesc: '',
    onChangeFailureDesc: vi.fn(),
    newFailureRes: '',
    onChangeFailureRes: vi.fn(),
    onSubmitAddFailure: vi.fn(),
    convertingFailureId: null,
    conversionSuiteId: 'b1',
    onChangeConversionSuiteId: vi.fn(),
    conversionThreshold: 0.8,
    onChangeConversionThreshold: vi.fn(),
    onToggleConvert: vi.fn(),
    onSubmitConversion: vi.fn(),
    onDeleteFailure: vi.fn(),
    ...overrides,
  };
}

describe('FailuresTab', () => {
  it('renders the header and a failure case card', () => {
    render(<FailuresTab {...baseProps()} />);
    expect(screen.getByText('Failure Case Library')).toBeInTheDocument();
    expect(screen.getByText('UNRESOLVED FAULT')).toBeInTheDocument();
    expect(screen.getByText('Register Failure')).toBeInTheDocument();
  });

  it('shows the empty state when there are no failures', () => {
    render(<FailuresTab {...baseProps({ failures: [] })} />);
    expect(screen.getByText(/No failure logs registered in the database/i)).toBeInTheDocument();
  });

  it('fires onToggleAddFailure when the Register Failure button is clicked', () => {
    const onToggleAddFailure = vi.fn();
    render(<FailuresTab {...baseProps({ onToggleAddFailure })} />);
    fireEvent.click(screen.getByText('Register Failure'));
    expect(onToggleAddFailure).toHaveBeenCalledTimes(1);
  });

  it('shows the add-failure form and submits it when isAddingFailure is true', () => {
    const onSubmitAddFailure = vi.fn((e) => e.preventDefault());
    // The Input Prompt + Failure Description fields are `required`, so provide
    // non-empty values (as the shell would) to satisfy form validation on submit.
    render(<FailuresTab {...baseProps({
      isAddingFailure: true,
      newFailurePrompt: 'a prompt',
      newFailureDesc: 'a fault',
      onSubmitAddFailure,
    })} />);
    const submit = screen.getByText('Save Failure Case');
    expect(submit).toBeInTheDocument();
    fireEvent.click(submit);
    expect(onSubmitAddFailure).toHaveBeenCalledTimes(1);
  });

  it('fires onDeleteFailure with the case id when the delete button is clicked', () => {
    const onDeleteFailure = vi.fn();
    render(<FailuresTab {...baseProps({ onDeleteFailure })} />);
    fireEvent.click(screen.getByTitle('Delete Failure Case'));
    expect(onDeleteFailure).toHaveBeenCalledWith('fail-1');
  });

  it('fires onToggleConvert with the case id when Convert to Benchmark is clicked', () => {
    const onToggleConvert = vi.fn();
    render(<FailuresTab {...baseProps({ onToggleConvert })} />);
    fireEvent.click(screen.getByText('Convert to Benchmark'));
    expect(onToggleConvert).toHaveBeenCalledWith('fail-1');
  });

  it('submits the conversion form and passes the case id when converting', () => {
    const onSubmitConversion = vi.fn((e) => e.preventDefault());
    render(<FailuresTab {...baseProps({ convertingFailureId: 'fail-1', onSubmitConversion })} />);
    fireEvent.click(screen.getByText('Confirm Permanent Test Conversion'));
    expect(onSubmitConversion).toHaveBeenCalledTimes(1);
    expect(onSubmitConversion.mock.calls[0][1]).toBe('fail-1');
  });
});
