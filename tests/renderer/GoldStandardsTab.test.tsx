import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GoldStandardsTab } from '../../src/components/evaluations/GoldStandardsTab';

// W6-1 part 6: render test for the extracted presentational Gold Standards tab.
// Pins the visible content (header, add-form toggle, tag-filter bar, reference
// card, empty state) and the callback contracts the shell relies on (add-form
// submit, tag selection, delete). Pure component — the add-form fields and the
// selected tag filter are owned by the parent shell and passed in as props.

const goldStandards: any[] = [
  {
    id: 'gold-1', title: 'Best Suno Prompt', content: 'An optimal ambient prompt',
    tags: ['suno', 'ambient'], type: 'prompt', source: 'lead-designer',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function baseProps(overrides: Record<string, any> = {}) {
  return {
    goldStandards,
    isAddingGold: false,
    onToggleAddGold: vi.fn(),
    newGoldTitle: '',
    onChangeGoldTitle: vi.fn(),
    newGoldType: 'prompt' as const,
    onChangeGoldType: vi.fn(),
    newGoldSource: '',
    onChangeGoldSource: vi.fn(),
    newGoldTags: '',
    onChangeGoldTags: vi.fn(),
    newGoldContent: '',
    onChangeGoldContent: vi.fn(),
    onSubmitAddGold: vi.fn(),
    selectedTagFilter: '',
    onSelectTag: vi.fn(),
    onDeleteGoldStandard: vi.fn(),
    ...overrides,
  };
}

describe('GoldStandardsTab', () => {
  it('renders the header and a gold-standard reference card', () => {
    render(<GoldStandardsTab {...baseProps()} />);
    expect(screen.getByText('Gold Standards Reference Library')).toBeInTheDocument();
    expect(screen.getByText('Best Suno Prompt')).toBeInTheDocument();
    expect(screen.getByText('Add Gold Standard')).toBeInTheDocument();
  });

  it('shows the empty state when there are no gold standards', () => {
    render(<GoldStandardsTab {...baseProps({ goldStandards: [] })} />);
    expect(screen.getByText(/No gold standards references stored in library yet/i)).toBeInTheDocument();
  });

  it('fires onToggleAddGold when the Add Gold Standard button is clicked', () => {
    const onToggleAddGold = vi.fn();
    render(<GoldStandardsTab {...baseProps({ onToggleAddGold })} />);
    fireEvent.click(screen.getByText('Add Gold Standard'));
    expect(onToggleAddGold).toHaveBeenCalledTimes(1);
  });

  it('shows the add-form and submits it when isAddingGold is true', () => {
    const onSubmitAddGold = vi.fn((e) => e.preventDefault());
    // Standard Title + Reference Content are `required`, so provide non-empty
    // values (as the shell would) to satisfy form validation on submit.
    render(<GoldStandardsTab {...baseProps({
      isAddingGold: true,
      newGoldTitle: 'a title',
      newGoldContent: 'some content',
      onSubmitAddGold,
    })} />);
    const submit = screen.getByText('Save Gold Standard Spec');
    expect(submit).toBeInTheDocument();
    fireEvent.click(submit);
    expect(onSubmitAddGold).toHaveBeenCalledTimes(1);
  });

  it('renders the tag-filter bar and fires onSelectTag with the tag when a tag is clicked', () => {
    const onSelectTag = vi.fn();
    render(<GoldStandardsTab {...baseProps({ onSelectTag })} />);
    // Derived from goldStandards tags, uppercased in the filter bar.
    fireEvent.click(screen.getByText('SUNO'));
    expect(onSelectTag).toHaveBeenCalledWith('suno');
  });

  it('fires onSelectTag with an empty string when ALL is clicked', () => {
    const onSelectTag = vi.fn();
    render(<GoldStandardsTab {...baseProps({ onSelectTag })} />);
    fireEvent.click(screen.getByText('ALL'));
    expect(onSelectTag).toHaveBeenCalledWith('');
  });

  it('fires onDeleteGoldStandard with the id when the delete button is clicked', () => {
    const onDeleteGoldStandard = vi.fn();
    render(<GoldStandardsTab {...baseProps({ onDeleteGoldStandard })} />);
    fireEvent.click(screen.getByTitle('Delete Gold Standard Reference'));
    expect(onDeleteGoldStandard).toHaveBeenCalledWith('gold-1');
  });
});
