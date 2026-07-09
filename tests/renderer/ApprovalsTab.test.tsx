import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalsTab } from '../../src/components/evaluations/ApprovalsTab';

// W6-1 part 3: render test for the extracted presentational Approvals tab.
// Pins the visible content (header, empty state, approval card) and the
// approve/reject callback contracts the shell relies on. Pure component.

const benchmarks: any[] = [
  { id: 'b1', name: 'Prompt Quality', criteria: [], baselineScore: 0.87, testCases: [] },
];

const queue: any[] = [
  {
    id: 'app-1', benchmarkId: 'b1', runId: 'run-1', title: 'Prompt Engine Update',
    previousScore: 0.87, currentScore: 0.82, failuresCount: 1, status: 'open',
    submittedAt: '2026-01-01T00:00:00.000Z',
  },
];

function baseProps(overrides: Record<string, any> = {}) {
  return {
    approvalQueue: queue,
    benchmarks,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
}

describe('ApprovalsTab', () => {
  it('renders the header and a pending approval card', () => {
    render(<ApprovalsTab {...baseProps()} />);
    expect(screen.getByText('Pending Governance Approvals')).toBeInTheDocument();
    expect(screen.getByText('Prompt Engine Update')).toBeInTheDocument();
    expect(screen.getByText('Approve Run')).toBeInTheDocument();
    expect(screen.getByText('Reject Run')).toBeInTheDocument();
  });

  it('shows the empty state when the queue is empty', () => {
    render(<ApprovalsTab {...baseProps({ approvalQueue: [] })} />);
    expect(screen.getByText(/No pending evaluations in approval queue/i)).toBeInTheDocument();
  });

  it('fires onApprove with the item id when Approve Run is clicked', () => {
    const onApprove = vi.fn();
    render(<ApprovalsTab {...baseProps({ onApprove })} />);
    fireEvent.click(screen.getByText('Approve Run'));
    expect(onApprove).toHaveBeenCalledWith('app-1');
  });

  it('fires onReject with the item id when Reject Run is clicked', () => {
    const onReject = vi.fn();
    render(<ApprovalsTab {...baseProps({ onReject })} />);
    fireEvent.click(screen.getByText('Reject Run'));
    expect(onReject).toHaveBeenCalledWith('app-1');
  });
});
