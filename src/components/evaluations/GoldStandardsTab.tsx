import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GoldStandard } from '../../types/evals';

export type GoldStandardType = 'prompt' | 'output' | 'document' | 'rubric';

/**
 * Presentational Gold Standards tab, extracted verbatim from EvaluationsView.tsx
 * (W6-1 part 6). Behavior-preserving: the JSX (markup, classNames, labels,
 * add-form, tag-filter bar, empty state, and reference cards) is unchanged.
 *
 * The parent shell still owns ALL state — the add-form fields, the selected tag
 * filter, and the store hook usage. This tab is conditionally rendered by the
 * shell but the shell itself never unmounts on sub-tab switch, so keeping the
 * form/filter state in the shell preserves the existing behavior where a
 * half-filled form and an active tag filter survive switching away and back.
 *
 * The unique-tags list and the tag-filtered list are pure derivations of the
 * `goldStandards` + `selectedTagFilter` props; they are computed here inline
 * exactly as the shell computed them before. This component receives values +
 * callbacks that reproduce the exact prior inline handlers:
 *   - onToggleAddGold()          -> setIsAddingGold(!isAddingGold)
 *   - onChangeGold*(v)           -> setNewGold*(v)
 *   - onSubmitAddGold(e)         -> handleAddGoldSubmit
 *   - onSelectTag(v)             -> setSelectedTagFilter (ALL passes '', a tag toggles)
 *   - onDeleteGoldStandard(id)   -> deleteGoldStandard(id)
 */
export interface GoldStandardsTabProps {
  goldStandards: GoldStandard[];

  // Add-gold-standard form (shell-owned)
  isAddingGold: boolean;
  onToggleAddGold: () => void;
  newGoldTitle: string;
  onChangeGoldTitle: (value: string) => void;
  newGoldType: GoldStandardType;
  onChangeGoldType: (value: GoldStandardType) => void;
  newGoldSource: string;
  onChangeGoldSource: (value: string) => void;
  newGoldTags: string;
  onChangeGoldTags: (value: string) => void;
  newGoldContent: string;
  onChangeGoldContent: (value: string) => void;
  onSubmitAddGold: (e: React.FormEvent) => void;

  // Tag filter (shell-owned)
  selectedTagFilter: string;
  onSelectTag: (tag: string) => void;

  onDeleteGoldStandard: (id: string) => void;
}

export const GoldStandardsTab: React.FC<GoldStandardsTabProps> = ({
  goldStandards,
  isAddingGold,
  onToggleAddGold,
  newGoldTitle,
  onChangeGoldTitle,
  newGoldType,
  onChangeGoldType,
  newGoldSource,
  onChangeGoldSource,
  newGoldTags,
  onChangeGoldTags,
  newGoldContent,
  onChangeGoldContent,
  onSubmitAddGold,
  selectedTagFilter,
  onSelectTag,
  onDeleteGoldStandard,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-gray-900 pb-2">
        <div>
          <h2 className="text-sm font-bold font-mono text-gray-200">Gold Standards Reference Library</h2>
          <p className="text-xs text-gray-500">Reference items, standard inputs, and optimal model outputs used for evaluations.</p>
        </div>

        <button
          onClick={onToggleAddGold}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isAddingGold ? 'Cancel Form' : 'Add Gold Standard'}</span>
        </button>
      </div>

      {/* Add Gold Standard Form */}
      {isAddingGold && (
        <form onSubmit={onSubmitAddGold} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
          <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
            New Gold Standard Definition
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1 md:col-span-2">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Standard Title</label>
              <input
                type="text"
                required
                value={newGoldTitle}
                onChange={(e) => onChangeGoldTitle(e.target.value)}
                placeholder="e.g. Best Suno Prompt"
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Content Type</label>
              <select
                value={newGoldType}
                onChange={(e) => onChangeGoldType(e.target.value as any)}
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              >
                <option value="prompt">Prompt</option>
                <option value="output">Output</option>
                <option value="document">Document</option>
                <option value="rubric">Rubric</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Source Reference (Optional)</label>
              <input
                type="text"
                value={newGoldSource}
                onChange={(e) => onChangeGoldSource(e.target.value)}
                placeholder="e.g. lead-designer, sound-architect"
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Tags (comma-separated)</label>
              <input
                type="text"
                value={newGoldTags}
                onChange={(e) => onChangeGoldTags(e.target.value)}
                placeholder="e.g. suno, ambient, v1"
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-gray-500 uppercase text-[9px] font-bold">Reference Content / Standard text</label>
            <textarea
              required
              value={newGoldContent}
              onChange={(e) => onChangeGoldContent(e.target.value)}
              rows={4}
              placeholder="Enter standard template or optimal music prompt description here..."
              className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
          >
            Save Gold Standard Spec
          </button>
        </form>
      )}

      {/* Tags Filters list */}
      {goldStandards.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center font-mono text-[10px] bg-[#111827]/40 p-2.5 rounded border border-gray-900">
          <span className="text-gray-500 uppercase font-bold mr-1">Filter Tags:</span>
          <button
            onClick={() => onSelectTag('')}
            className={`px-2 py-0.5 rounded transition-all border ${!selectedTagFilter ? 'bg-blue-950/40 text-blue-400 border-blue-900/40' : 'bg-gray-950 text-gray-500 border-transparent hover:text-gray-300'}`}
          >
            ALL
          </button>
          {Array.from(new Set(goldStandards.flatMap(g => g.tags))).map(tag => (
            <button
              key={tag}
              onClick={() => onSelectTag(selectedTagFilter === tag ? '' : tag)}
              className={`px-2 py-0.5 rounded transition-all border ${selectedTagFilter === tag ? 'bg-blue-950/40 text-blue-400 border-blue-900/40' : 'bg-gray-950 text-gray-500 border-transparent hover:text-gray-300'}`}
            >
              {tag.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Gold Standards List Grid */}
      {goldStandards.length === 0 ? (
        <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
          No gold standards references stored in library yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {goldStandards
            .filter(g => !selectedTagFilter || g.tags.includes(selectedTagFilter))
            .map((g) => (
              <div key={g.id} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 relative group">
                <button
                  onClick={() => onDeleteGoldStandard(g.id)}
                  className="absolute top-4 right-4 text-gray-600 hover:text-red-400 transition-colors p-1"
                  title="Delete Gold Standard Reference"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.2 rounded bg-blue-950 text-blue-400 border border-blue-900/30 text-[8px] font-bold uppercase">
                      {g.type}
                    </span>
                    <span className="text-[10px] text-gray-500">Source: <strong className="text-gray-400">{g.source}</strong></span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-200">{g.title}</h3>
                </div>

                <p className="text-gray-400 bg-gray-950/50 p-2.5 rounded border border-gray-900 italic font-sans max-h-32 overflow-y-auto whitespace-pre-wrap">
                  "{g.content}"
                </p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {g.tags.map((t, idx) => (
                    <span key={idx} className="px-1.5 py-0.2 rounded bg-gray-900 border border-gray-850 text-[9px] text-gray-500">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
