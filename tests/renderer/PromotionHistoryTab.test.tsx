import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PromotionHistoryTab } from '../../src/components/evaluations/PromotionHistoryTab';

// W6-1 part 5: render test for the extracted presentational Promotion History
// tab. Read-only component (no callbacks, no local state) — pins the header,
// the empty state, and the rendering of a promotion audit-trail row.

const promotions: any[] = [
  {
    timestamp: '2026-01-01T00:00:00.000Z',
    benchmarkId: 'b1',
    benchmarkName: 'Prompt Quality',
    oldScore: 0.8,
    newScore: 0.87,
    approvedBy: 'operator',
    reason: 'Optimized system prompt constraints',
    runId: 'run-abcdef',
  },
];

describe('PromotionHistoryTab', () => {
  it('renders the header', () => {
    render(<PromotionHistoryTab promotions={[]} />);
    expect(screen.getByText('Baseline Promotion History Log')).toBeInTheDocument();
  });

  it('shows the empty state when there are no promotions', () => {
    render(<PromotionHistoryTab promotions={[]} />);
    expect(screen.getByText(/No baseline promotion events logged/i)).toBeInTheDocument();
  });

  it('renders a promotion audit-trail row', () => {
    render(<PromotionHistoryTab promotions={promotions} />);
    expect(screen.getByText('Prompt Quality')).toBeInTheDocument();
    expect(screen.getByText('0.8')).toBeInTheDocument();
    expect(screen.getByText('0.87')).toBeInTheDocument();
    expect(screen.getByText(/Optimized system prompt constraints/)).toBeInTheDocument();
    // approvedBy + the last 6 chars of the runId are surfaced in the row.
    expect(screen.getByText('operator')).toBeInTheDocument();
    expect(screen.getByText(/Source Run: abcdef/)).toBeInTheDocument();
  });
});
