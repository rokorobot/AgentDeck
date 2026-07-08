import React from 'react';
import { Play } from 'lucide-react';
import { BenchmarkDefinition } from '../../types/evals';

/**
 * Presentational Benchmarks tab, extracted verbatim from EvaluationsView.tsx
 * (W6-1 part 1). Behavior-preserving: the JSX (markup, classNames, empty-state,
 * benchmark cards) is unchanged. The parent still owns all state; this component
 * reads `benchmarks` and reports "Run Suite" clicks via `onRunSuite(benchmarkId)`
 * — the callback the shell wires to `setSelectedBenchmarkId(id)` +
 * `setActiveSubTab('regression')`, exactly as the inline handler did.
 */
export interface BenchmarksTabProps {
  benchmarks: BenchmarkDefinition[];
  onRunSuite: (benchmarkId: string) => void;
}

export const BenchmarksTab: React.FC<BenchmarksTabProps> = ({ benchmarks, onRunSuite }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold font-mono text-gray-200">Active Quality Benchmarks</h2>
          <p className="text-xs text-gray-500">List of validation suites defined in the current workspace manifest scope.</p>
        </div>
      </div>

      {benchmarks.length === 0 ? (
        <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
          No active benchmarks defined for this workspace. Use the Manifest Editor to set up evals criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {benchmarks.map((b) => (
            <div key={b.id} className="p-4 rounded border border-gray-800 bg-[#111827]/40 space-y-3 font-mono">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase text-blue-500 font-bold tracking-wider">Benchmark Spec</span>
                  <h3 className="text-sm font-bold text-gray-300 mt-0.5">{b.name}</h3>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-500 uppercase">Baseline</span>
                  <div className="text-lg font-bold text-green-400">{b.baselineScore}</div>
                </div>
              </div>

              <p className="text-xs text-gray-400 font-sans">{b.description || 'No description provided.'}</p>

              <div className="space-y-1">
                <span className="text-[9px] uppercase text-gray-500 font-bold">Evaluations Criteria</span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {b.criteria.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-gray-900 border border-gray-800 text-[10px] text-gray-400">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center border-t border-gray-900">
                <span className="text-[10px] text-gray-500">
                  Gold Standards: <strong className="text-gray-400">{b.goldStandardsCount || 10} prompts</strong>
                </span>

                <button
                  onClick={() => onRunSuite(b.id)}
                  className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Run Suite</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
