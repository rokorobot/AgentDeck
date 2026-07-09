import React from 'react';
import { Play, Check, X } from 'lucide-react';
import { BenchmarkDefinition, RegressionRun } from '../../types/evals';

/**
 * Presentational Regression Runs tab, extracted verbatim from EvaluationsView.tsx
 * (W6-1 part 2). Behavior-preserving: the JSX (markup, classNames, labels,
 * empty/loading states, run cards, report drawer) is unchanged. The parent shell
 * still owns all state; this component receives the values it renders plus
 * callbacks that reproduce the exact prior inline handlers:
 *   - onSelectBenchmark(id)  -> setSelectedBenchmarkId
 *   - onRunRegression()      -> handleRunRegression
 *   - onPromoteBaseline(b,r) -> handlePromoteBaselineClick
 *   - onToggleReport(runId)  -> the "=== run.id ? null : run.id" toggle
 */
export interface RegressionTabProps {
  benchmarks: BenchmarkDefinition[];
  regressionRuns: RegressionRun[];
  isRunningBenchmark: boolean;
  evalScript: any;
  selectedBenchmarkId: string;
  selectedRunIdForReport: string | null;
  onSelectBenchmark: (benchmarkId: string) => void;
  onRunRegression: () => void;
  onPromoteBaseline: (benchmarkId: string, runId: string) => void;
  onToggleReport: (runId: string) => void;
}

export const RegressionTab: React.FC<RegressionTabProps> = ({
  benchmarks,
  regressionRuns,
  isRunningBenchmark,
  evalScript,
  selectedBenchmarkId,
  selectedRunIdForReport,
  onSelectBenchmark,
  onRunRegression,
  onPromoteBaseline,
  onToggleReport,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#111827]/40 p-4 rounded border border-gray-800">
        <div className="space-y-1">
          <h2 className="text-sm font-bold font-mono text-gray-200">Regression Run Pipeline</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">Select target benchmark:</span>
            <select
              value={selectedBenchmarkId}
              onChange={(e) => onSelectBenchmark(e.target.value)}
              className="bg-[#0B0F14] border border-gray-800 focus:outline-none text-[11px] font-mono px-2 py-0.5 rounded text-blue-400"
            >
              {benchmarks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onRunRegression}
            disabled={isRunningBenchmark}
            className={`px-4 py-1.5 rounded font-mono text-xs font-bold transition-all border flex items-center gap-1.5 ${
              isRunningBenchmark
                ? 'bg-gray-800 border-transparent text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600 hover:scale-[1.02]'
            }`}
          >
            {isRunningBenchmark ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-t-transparent border-gray-400 rounded-full animate-spin" />
                <span>EVALUATING...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>RUN REGRESSION SET</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Run Progress Alert simulated */}
      {isRunningBenchmark && (
        <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded flex flex-col gap-2 font-mono text-xs text-blue-400 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
            <span>[Evaluator] Deploying test prompt instances against local models...</span>
          </div>
          {!evalScript && (
            <div className="text-[10px] text-gray-500 pl-3 uppercase">
              SIMULATION FALLBACK IN PROGRESS: DEMO DATA INCOMING
            </div>
          )}
        </div>
      )}

      {/* Regression list */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase text-gray-500 font-mono tracking-wider">Run History Log</h3>

        {regressionRuns.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
            No evaluations history recorded yet. Trigger a Regression Set to populate logs.
          </div>
        ) : (
          <div className="space-y-2">
            {regressionRuns.map((run) => {
              const isNeg = run.diff < 0;
              const isPos = run.diff > 0;
              const diffText = isNeg ? `${run.diff}` : isPos ? `+${run.diff}` : '0.00';
              const runBenchmark = benchmarks.find(b => b.id === run.benchmarkId);

              return (
                <div key={run.id} className="p-3 bg-[#111827]/30 border border-gray-800 rounded flex flex-col gap-3 font-mono text-xs">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 w-full">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[9px] rounded font-bold ${
                          run.status === 'pass'
                            ? 'bg-green-950/40 text-green-400 border border-green-900/40'
                            : 'bg-red-950/40 text-red-400 border border-red-900/40'
                        }`}>
                          {run.status === 'pass' ? '✓ PASS' : '✗ REGRESSION DETECTED'}
                        </span>

                        {run.isSimulated && (
                          <span className="px-1.5 py-0.2 rounded bg-gray-900 border border-gray-800 text-[8px] text-gray-500 uppercase font-semibold">
                            SIMULATED RUN
                          </span>
                        )}

                        {run.isApproved && (
                          <span className="px-1.5 py-0.2 rounded bg-green-950/20 border border-green-900/30 text-[8px] text-green-400 uppercase font-semibold">
                            APPROVED
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-bold text-gray-300">
                        {runBenchmark?.name || run.benchmarkId} &ndash; {run.triggerContext}
                      </div>

                      <div className="text-[10px] text-gray-500">
                        Run ID: {run.id} &bull; Timestamp: {new Date(run.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 border-l border-gray-800/80 pl-4 md:border-l-0 md:pl-0">
                      <div className="text-center min-w-[70px]">
                        <span className="block text-[9px] text-gray-500 uppercase">Baseline</span>
                        <span className="text-gray-400 font-bold">{run.baselineScore}</span>
                      </div>
                      <div className="text-center min-w-[70px]">
                        <span className="block text-[9px] text-gray-500 uppercase">Current</span>
                        <span className={`font-bold ${run.status === 'pass' ? 'text-green-400' : 'text-red-400'}`}>{run.score}</span>
                      </div>
                      <div className="text-center min-w-[70px]">
                        <span className="block text-[9px] text-gray-500 uppercase">Diff</span>
                        <span className={`font-bold ${isNeg ? 'text-red-500' : isPos ? 'text-green-400' : 'text-gray-500'}`}>
                          {diffText}
                        </span>
                      </div>

                      {/* Promotion button if run has a different score but is not promoted yet */}
                      {runBenchmark && runBenchmark.baselineScore !== run.score && (
                        <button
                          onClick={() => onPromoteBaseline(run.benchmarkId, run.id)}
                          className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-900/40 px-2 py-0.5 rounded text-[10px] font-bold transition-all"
                          title="Promote this run score to become the new baseline definition target."
                        >
                          Promote Baseline
                        </button>
                      )}

                      {/* Report Toggle Button */}
                      {run.report && (
                        <button
                          onClick={() => onToggleReport(run.id)}
                          className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded text-[10px] font-bold transition-all"
                        >
                          {selectedRunIdForReport === run.id ? 'Hide Report' : 'View Report'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Detailed Benchmark Report Card */}
                  {selectedRunIdForReport === run.id && run.report && (
                    <div className="mt-2 p-3 bg-[#0B0F14]/75 border border-gray-800 rounded space-y-3 text-xs w-full">
                      <div className="flex justify-between items-center border-b border-gray-900 pb-1.5">
                        <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider">Benchmark Run Report</span>
                        <span className="text-[11px] font-bold text-gray-300">
                          Pass Rate: <strong className={run.report.passRate >= 80 ? 'text-green-400' : 'text-amber-500'}>{run.report.passRate}%</strong>
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-gray-500">
                          <span>Execution Pass Ratio</span>
                          <span>{run.report.passRate}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
                          <div
                            className={`h-full transition-all ${run.report.passRate >= 80 ? 'bg-green-500' : 'bg-amber-500'}`}
                            style={{ width: `${run.report.passRate}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {run.report.results.map((res: any, idx: number) => {
                          const isPassed = res.status === 'pass';
                          return (
                            <div key={idx} className="flex justify-between items-center bg-[#111827]/40 border border-gray-905/60 p-2 rounded text-[11px]">
                              <div className="flex items-center gap-2 max-w-[70%]">
                                {isPassed ? (
                                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                ) : (
                                  <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                )}
                                <span className="truncate text-gray-300" title={res.prompt}>
                                  {res.prompt}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-[10px]">Score:</span>
                                <span className={`font-bold ${isPassed ? 'text-green-400' : 'text-red-400'}`}>
                                  {res.score}
                                </span>
                                {res.isImproved && (
                                  <span className="px-1.5 py-0.2 rounded bg-green-950 text-green-400 border border-green-900/30 text-[8px] font-bold">
                                    ✓ IMPROVED
                                  </span>
                                )}
                                {res.isRegressed && (
                                  <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-400 border border-red-900/30 text-[8px] font-bold">
                                    ✗ REGRESSED
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
