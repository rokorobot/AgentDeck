import React from 'react';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
import { FailureCase, BenchmarkDefinition } from '../../types/evals';

/**
 * Presentational Failure Library tab, extracted verbatim from EvaluationsView.tsx
 * (W6-1 part 4). Behavior-preserving: the JSX (markup, classNames, labels, empty
 * state, add-failure form, failure cards, and the inline failure->test-case
 * conversion form) is unchanged.
 *
 * The parent shell still owns ALL state — the add-failure form fields, the
 * conversion fields, and the store hook usage. This tab is conditionally
 * rendered by the shell but the shell itself never unmounts on sub-tab switch,
 * so keeping the form/conversion state in the shell preserves the existing
 * behavior where a half-filled form survives switching away and back. This
 * component receives the values it renders plus callbacks that reproduce the
 * exact prior inline handlers:
 *   - onToggleAddFailure()          -> setIsAddingFailure(!isAddingFailure)
 *   - onChangeFailure*(v)           -> setNewFailure*(v)
 *   - onSubmitAddFailure(e)         -> handleAddFailureSubmit
 *   - onDeleteFailure(id)           -> deleteFailureCase(id)
 *   - onToggleConvert(id)           -> the "=== f.id ? null : f.id" toggle + suite reset
 *   - onChangeConversionSuiteId(v)  -> setConversionSuiteId
 *   - onChangeConversionThreshold(v)-> setConversionThreshold(parseFloat(...))
 *   - onSubmitConversion(e, id)     -> convertFailureToTestCase + close form
 */
export interface FailuresTabProps {
  failures: FailureCase[];
  benchmarks: BenchmarkDefinition[];

  // Add-failure form (shell-owned)
  isAddingFailure: boolean;
  onToggleAddFailure: () => void;
  newFailurePrompt: string;
  onChangeFailurePrompt: (value: string) => void;
  newFailureExpected: string;
  onChangeFailureExpected: (value: string) => void;
  newFailureActual: string;
  onChangeFailureActual: (value: string) => void;
  newFailureDesc: string;
  onChangeFailureDesc: (value: string) => void;
  newFailureRes: string;
  onChangeFailureRes: (value: string) => void;
  onSubmitAddFailure: (e: React.FormEvent) => void;

  // Failure conversion (shell-owned)
  convertingFailureId: string | null;
  conversionSuiteId: string;
  onChangeConversionSuiteId: (value: string) => void;
  conversionThreshold: number;
  onChangeConversionThreshold: (value: number) => void;
  onToggleConvert: (failureId: string) => void;
  onSubmitConversion: (e: React.FormEvent, failureId: string) => void;

  onDeleteFailure: (id: string) => void;
}

export const FailuresTab: React.FC<FailuresTabProps> = ({
  failures,
  benchmarks,
  isAddingFailure,
  onToggleAddFailure,
  newFailurePrompt,
  onChangeFailurePrompt,
  newFailureExpected,
  onChangeFailureExpected,
  newFailureActual,
  onChangeFailureActual,
  newFailureDesc,
  onChangeFailureDesc,
  newFailureRes,
  onChangeFailureRes,
  onSubmitAddFailure,
  convertingFailureId,
  conversionSuiteId,
  onChangeConversionSuiteId,
  conversionThreshold,
  onChangeConversionThreshold,
  onToggleConvert,
  onSubmitConversion,
  onDeleteFailure,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-gray-900 pb-2">
        <div>
          <h2 className="text-sm font-bold font-mono text-gray-200">Failure Case Library</h2>
          <p className="text-xs text-gray-500">Historical database of validation faults and prompt failures used to enforce regression thresholds.</p>
        </div>

        <button
          onClick={onToggleAddFailure}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isAddingFailure ? 'Cancel Form' : 'Register Failure'}</span>
        </button>
      </div>

      {/* Add Failure Form */}
      {isAddingFailure && (
        <form onSubmit={onSubmitAddFailure} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
          <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
            Manual Failure Registration
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Input Prompt</label>
              <input
                type="text"
                required
                value={newFailurePrompt}
                onChange={(e) => onChangeFailurePrompt(e.target.value)}
                placeholder="e.g. Coldwave track prompt..."
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Failure Description</label>
              <input
                type="text"
                required
                value={newFailureDesc}
                onChange={(e) => onChangeFailureDesc(e.target.value)}
                placeholder="e.g. Output contains trance synths..."
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Expected Output Description</label>
              <textarea
                value={newFailureExpected}
                onChange={(e) => onChangeFailureExpected(e.target.value)}
                rows={2}
                placeholder="What should the gold standard model output be?"
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-gray-500 uppercase text-[9px] font-bold">Actual Faulty Output</label>
              <textarea
                value={newFailureActual}
                onChange={(e) => onChangeFailureActual(e.target.value)}
                rows={2}
                placeholder="What did the faulty engine generate?"
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-gray-500 uppercase text-[9px] font-bold">Resolution constraints added (Resolution Notes)</label>
            <input
              type="text"
              value={newFailureRes}
              onChange={(e) => onChangeFailureRes(e.target.value)}
              placeholder="e.g. Added genre bounds to System Prompts"
              className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
          >
            Save Failure Case
          </button>
        </form>
      )}

      {failures.length === 0 ? (
        <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
          No failure logs registered in the database.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 font-mono text-xs">
          {failures.map((f) => (
            <div key={f.id} className="p-4 bg-[#111827]/30 border border-gray-800 rounded space-y-3 relative group">
              <button
                onClick={() => onDeleteFailure(f.id)}
                className="absolute top-4 right-4 text-gray-600 hover:text-red-400 transition-colors p-1"
                title="Delete Failure Case"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[9px] rounded font-bold ${
                  f.resolved
                    ? 'bg-green-950/40 text-green-400 border border-green-900/40'
                    : 'bg-red-950/40 text-red-400 border border-red-900/40'
                }`}>
                  {f.resolved ? 'RESOLVED' : 'UNRESOLVED FAULT'}
                </span>
                <span className="text-[10px] text-gray-500">Case ID: {f.id} &bull; Stored: {new Date(f.timestamp).toLocaleString()}</span>
              </div>

              <div className="space-y-1">
                <div className="text-gray-500 uppercase text-[9px] font-bold">Input Prompt</div>
                <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1.5 rounded text-gray-300 italic">
                  "{f.prompt}"
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="p-2 bg-[#0B0F14]/60 border border-gray-800 rounded space-y-1">
                  <span className="text-red-400 font-bold block text-[9px] uppercase">Actual (Faulty Output)</span>
                  <p className="text-gray-400 italic">"{f.actual || 'N/A'}"</p>
                  <div className="text-[10px] text-red-300 font-bold pt-1">
                    Fault: {f.failureDescription}
                  </div>
                </div>

                <div className="p-2 bg-[#0B0F14]/60 border border-gray-800 rounded space-y-1">
                  <span className="text-green-400 font-bold block text-[9px] uppercase">Expected (Gold Standard)</span>
                  <p className="text-gray-400 italic">"{f.expected || 'N/A'}"</p>
                </div>
              </div>

              {f.resolution && (
                <div className="p-2 bg-green-950/5 border border-green-900/20 rounded">
                  <div className="text-green-400 font-bold text-[9px] uppercase">Resolution Constraint</div>
                  <div className="text-gray-300 pt-0.5">{f.resolution}</div>
                </div>
              )}

              {f.converted ? (
                <div className="p-2 bg-green-950/15 border border-green-900/30 text-green-400 rounded flex items-center gap-1.5 mt-2">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Converted to Benchmark test case in <strong className="font-bold">{f.convertedToBenchmarkId}</strong> (Case ID: {f.convertedToTestCaseId?.slice(-6)})
                  </span>
                </div>
              ) : (
                <div className="pt-2 border-t border-gray-900 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-500 font-mono">Continuous Improvement:</span>
                    <button
                      type="button"
                      onClick={() => onToggleConvert(f.id)}
                      className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded text-[10px] font-bold transition-all"
                    >
                      {convertingFailureId === f.id ? 'Cancel Conversion' : 'Convert to Benchmark'}
                    </button>
                  </div>

                  {convertingFailureId === f.id && (
                    <form
                      onSubmit={(e) => onSubmitConversion(e, f.id)}
                      className="p-3 bg-[#0B0F14] border border-gray-800 rounded space-y-2 mt-1 text-[11px]"
                    >
                      <div className="text-[10px] text-blue-400 uppercase font-bold tracking-wider">Failure &rarr; Test Spec Conversion</div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-gray-500 uppercase text-[9px] font-bold block">Target Benchmark Suite</label>
                          <select
                            value={conversionSuiteId}
                            onChange={(e) => onChangeConversionSuiteId(e.target.value)}
                            className="w-full bg-[#111827] border border-gray-800 text-[11px] p-1 text-gray-300 rounded focus:outline-none focus:border-blue-500"
                          >
                            {benchmarks.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-gray-500 uppercase text-[9px] font-bold block">Evaluation Pass Threshold</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            required
                            value={conversionThreshold}
                            onChange={(e) => onChangeConversionThreshold(parseFloat(e.target.value))}
                            className="w-full bg-[#111827] border border-gray-800 text-[11px] p-1 text-gray-300 rounded focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 font-bold text-[10px] transition-all"
                      >
                        Confirm Permanent Test Conversion
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
