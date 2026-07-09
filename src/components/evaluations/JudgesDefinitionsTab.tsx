import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BenchmarkDefinition, JudgeDefinition } from '../../types/evals';

/**
 * Presentational Judges & Definitions tab, extracted verbatim from
 * EvaluationsView.tsx (W6-1 part 7 — the final tab extraction). Behavior-
 * preserving: the JSX (dual-pane layout, markup, classNames, labels, both
 * add-forms, empty states, benchmark-spec cards, and judge cards) is unchanged.
 *
 * The parent shell still owns ALL state — the benchmark-spec config form fields,
 * the judge-definition form fields, and the store hook usage. This tab is
 * conditionally rendered by the shell but the shell itself never unmounts on
 * sub-tab switch, so keeping the form state in the shell preserves the existing
 * behavior where a half-filled form survives switching away and back. This
 * component receives values + callbacks that reproduce the exact prior inline
 * handlers:
 *   - onToggleAddBenchmark()      -> setIsAddingBenchmark(!isAddingBenchmark)
 *   - onChangeBenchmark*(v)       -> setNewBenchmark*(v)
 *   - onSubmitAddBenchmark(e)     -> handleAddBenchmarkSubmit
 *   - onToggleAddJudge()          -> setIsAddingJudge(!isAddingJudge)
 *   - onChangeJudge*(v)           -> setNewJudge*(v)
 *   - onSubmitAddJudge(e)         -> handleAddJudgeSubmit
 *   - onDeleteJudge(id)           -> deleteJudge(id)
 *
 * `evalThreshold` is the shell-derived workspace failure threshold, passed in
 * for the read-only "Failure Threshold" display.
 */
export interface JudgesDefinitionsTabProps {
  benchmarks: BenchmarkDefinition[];
  judges: JudgeDefinition[];
  evalThreshold: number;

  // Benchmark-spec config form (shell-owned)
  isAddingBenchmark: boolean;
  onToggleAddBenchmark: () => void;
  newBenchmarkName: string;
  onChangeBenchmarkName: (value: string) => void;
  newBenchmarkBaseline: number;
  onChangeBenchmarkBaseline: (value: number) => void;
  newBenchmarkDesc: string;
  onChangeBenchmarkDesc: (value: string) => void;
  newBenchmarkCriteria: string;
  onChangeBenchmarkCriteria: (value: string) => void;
  onSubmitAddBenchmark: (e: React.FormEvent) => void;

  // Judge-definition form (shell-owned)
  isAddingJudge: boolean;
  onToggleAddJudge: () => void;
  newJudgeName: string;
  onChangeJudgeName: (value: string) => void;
  newJudgeThreshold: number;
  onChangeJudgeThreshold: (value: number) => void;
  newJudgeCriteria: string;
  onChangeJudgeCriteria: (value: string) => void;
  onSubmitAddJudge: (e: React.FormEvent) => void;

  onDeleteJudge: (id: string) => void;
}

export const JudgesDefinitionsTab: React.FC<JudgesDefinitionsTabProps> = ({
  benchmarks,
  judges,
  evalThreshold,
  isAddingBenchmark,
  onToggleAddBenchmark,
  newBenchmarkName,
  onChangeBenchmarkName,
  newBenchmarkBaseline,
  onChangeBenchmarkBaseline,
  newBenchmarkDesc,
  onChangeBenchmarkDesc,
  newBenchmarkCriteria,
  onChangeBenchmarkCriteria,
  onSubmitAddBenchmark,
  isAddingJudge,
  onToggleAddJudge,
  newJudgeName,
  onChangeJudgeName,
  newJudgeThreshold,
  onChangeJudgeThreshold,
  newJudgeCriteria,
  onChangeJudgeCriteria,
  onSubmitAddJudge,
  onDeleteJudge,
}) => {
  return (
    <div className="space-y-6">
      {/* Split Grid: Suite Dimensions vs Judges List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Left Side: Benchmark Suite configs */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-gray-900 pb-2">
            <div>
              <h2 className="text-sm font-bold font-mono text-gray-200">Suite Quality Dimensions</h2>
              <p className="text-xs text-gray-500">Configure parameters, criteria sliders, and gold standard baselines.</p>
            </div>

            <button
              onClick={onToggleAddBenchmark}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddingBenchmark ? 'Cancel Form' : 'Create Benchmark'}</span>
            </button>
          </div>

          {/* Add Benchmark Form */}
          {isAddingBenchmark && (
            <form onSubmit={onSubmitAddBenchmark} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
              <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
                New Benchmark Spec Definition
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-gray-500 uppercase text-[9px] font-bold">Benchmark Suite Name</label>
                  <input
                    type="text"
                    required
                    value={newBenchmarkName}
                    onChange={(e) => onChangeBenchmarkName(e.target.value)}
                    placeholder="e.g. Sound Machina Prompt Quality"
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-500 uppercase text-[9px] font-bold">Baseline Target Score</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    required
                    value={newBenchmarkBaseline}
                    onChange={(e) => onChangeBenchmarkBaseline(parseFloat(e.target.value))}
                    placeholder="e.g. 0.85"
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] font-bold">Suite Description</label>
                <textarea
                  value={newBenchmarkDesc}
                  onChange={(e) => onChangeBenchmarkDesc(e.target.value)}
                  rows={2}
                  placeholder="Describe the quality goals of this validation suite..."
                  className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                />
              </div>

              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] font-bold">Evaluation Criteria Dimensions (comma-separated)</label>
                <input
                  type="text"
                  value={newBenchmarkCriteria}
                  onChange={(e) => onChangeBenchmarkCriteria(e.target.value)}
                  placeholder="e.g. Melodic structure, Genre consistency, Production usability"
                  className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                />
                <p className="text-[10px] text-gray-500">Provide comma-separated dimensions to score outputs against.</p>
              </div>

              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
              >
                Create Benchmark Spec
              </button>
            </form>
          )}

          {benchmarks.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
              No active benchmarks defined to edit.
            </div>
          ) : (
            <div className="space-y-4">
              {benchmarks.map((b) => (
                <div key={b.id} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-4 font-mono text-xs">
                  <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                    <div className="font-bold text-gray-300 text-sm">{b.name}</div>
                    <span className="text-[10px] text-gray-500 uppercase">Config Spec</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-gray-500 uppercase text-[9px] font-bold">Suite ID</label>
                        <input
                          type="text"
                          disabled
                          value={b.id}
                          className="w-full bg-[#0B0F14] border border-gray-800 px-3 py-1.5 rounded text-gray-500 cursor-not-allowed"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-gray-500 uppercase text-[9px] font-bold">Description</label>
                        <textarea
                          disabled
                          value={b.description || ''}
                          rows={3}
                          className="w-full bg-[#0B0F14] border border-gray-800 px-3 py-1.5 rounded text-gray-400 focus:outline-none cursor-default"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-gray-500 uppercase text-[9px] font-bold block">Weights Allocation (Criteria)</label>
                        <div className="space-y-2">
                          {b.criteria.map((c, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-gray-400">{c}</span>
                                <span className="text-blue-400 font-bold">Equal ({(100 / b.criteria.length).toFixed(0)}% Weight)</span>
                              </div>
                              <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${100 / b.criteria.length}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="space-y-1">
                          <label className="text-gray-500 uppercase text-[9px] font-bold">Baseline Target</label>
                          <div className="text-sm font-bold text-green-400 bg-gray-900 border border-gray-800 py-1.5 px-3 rounded text-center">
                            {b.baselineScore}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-500 uppercase text-[9px] font-bold">Failure Threshold</label>
                          <div className="text-sm font-bold text-amber-500 bg-gray-900 border border-gray-800 py-1.5 px-3 rounded text-center">
                            {evalThreshold}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Test Cases List */}
                  {b.testCases && b.testCases.length > 0 && (
                    <div className="pt-3 border-t border-gray-900 space-y-2">
                      <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Benchmark Test Cases ({b.testCases.length})</span>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {b.testCases.map((tc) => (
                          <div key={tc.id} className="p-2.5 bg-gray-950/60 border border-gray-900 rounded flex flex-col gap-1 text-[11px]">
                            <div className="flex justify-between items-center">
                              <span className="text-blue-400 font-bold">Prompt Case</span>
                              <span className="text-gray-500 text-[10px]">Threshold: <strong className="text-gray-400">{tc.threshold}</strong></span>
                            </div>
                            <p className="text-gray-300 italic">"{tc.prompt}"</p>
                            <div className="text-[10px] text-gray-500 pt-0.5">
                              <span className="text-green-500">Expected:</span> {tc.expected}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Judges definition */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-gray-900 pb-2">
            <div>
              <h2 className="text-sm font-bold font-mono text-gray-200">Evaluations Judges</h2>
              <p className="text-xs text-gray-500">Define judge instances, scoring rubrics, and acceptance thresholds.</p>
            </div>

            <button
              onClick={onToggleAddJudge}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddingJudge ? 'Cancel Form' : 'Add Judge'}</span>
            </button>
          </div>

          {/* Add Judge Form */}
          {isAddingJudge && (
            <form onSubmit={onSubmitAddJudge} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
              <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
                Add New Evaluation Judge
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-gray-500 uppercase text-[9px] font-bold">Judge Name</label>
                  <input
                    type="text"
                    required
                    value={newJudgeName}
                    onChange={(e) => onChangeJudgeName(e.target.value)}
                    placeholder="e.g. SunoPromptJudge"
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-500 uppercase text-[9px] font-bold">Acceptance Threshold</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    required
                    value={newJudgeThreshold}
                    onChange={(e) => onChangeJudgeThreshold(parseFloat(e.target.value))}
                    placeholder="e.g. 0.80"
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] font-bold">Judge Criteria Dimensions (comma-separated)</label>
                <input
                  type="text"
                  required
                  value={newJudgeCriteria}
                  onChange={(e) => onChangeJudgeCriteria(e.target.value)}
                  placeholder="e.g. musical specificity, genre consistency, clarity"
                  className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                />
                <p className="text-[10px] text-gray-500">Criteria weights will be split equally among these items.</p>
              </div>

              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
              >
                Save Judge Definition
              </button>
            </form>
          )}

          {/* Judges list */}
          <div className="grid grid-cols-1 gap-3 font-mono text-xs">
            {judges.map((j) => (
              <div key={j.id} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 relative group">
                <button
                  onClick={() => onDeleteJudge(j.id)}
                  className="absolute top-4 right-4 text-gray-600 hover:text-red-400 transition-colors p-1"
                  title="Delete Judge"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] uppercase text-purple-400 font-bold tracking-wider">Acceptance Evaluator</span>
                    <h3 className="text-sm font-bold text-gray-200 mt-0.5">{j.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-gray-500 uppercase block">Threshold</span>
                    <span className="text-md font-bold text-blue-400">{j.threshold}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] text-gray-500 uppercase font-bold">Criteria Dimensions</span>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {j.criteria.map((c, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-gray-900 border border-gray-800 text-[10px] text-gray-400">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
};
