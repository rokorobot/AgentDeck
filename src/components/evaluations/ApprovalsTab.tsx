import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { ApprovalQueueItem, BenchmarkDefinition } from '../../types/evals';

/**
 * Presentational Approval Queue tab, extracted verbatim from EvaluationsView.tsx
 * (W6-1 part 3). Behavior-preserving: the JSX (markup, classNames, labels,
 * empty state, approval cards) is unchanged. The parent shell still owns all
 * state and store actions; this component reads `approvalQueue` + `benchmarks`
 * and reports approve/reject via `onApprove(id)` / `onReject(id)` — the callbacks
 * the shell wires directly to the `approveRun` / `rejectRun` store actions (whose
 * timeline/provenance/promotion side-effects are unchanged and remain in the
 * store).
 */
export interface ApprovalsTabProps {
  approvalQueue: ApprovalQueueItem[];
  benchmarks: BenchmarkDefinition[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const ApprovalsTab: React.FC<ApprovalsTabProps> = ({ approvalQueue, benchmarks, onApprove, onReject }) => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold font-mono text-gray-200 font-bold">Pending Governance Approvals</h2>
        <p className="text-xs text-gray-500">Evaluations with regressions or score drops waiting for developer override/approvals.</p>
      </div>

      {approvalQueue.length === 0 ? (
        <div className="p-8 text-center text-xs text-green-500 border border-dashed border-green-950 rounded bg-green-950/5">
          ✓ No pending evaluations in approval queue. Runtimes conform to baseline expectations.
        </div>
      ) : (
        <div className="space-y-3 font-mono">
          {approvalQueue.map((item) => {
            const itemBenchmark = benchmarks.find(b => b.id === item.benchmarkId);

            return (
              <div key={item.id} className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[10px] uppercase font-bold text-amber-500">Pending Approval Review</span>
                    <span className="text-[10px] text-gray-500">Submitted: {new Date(item.submittedAt).toLocaleTimeString()}</span>
                  </div>

                  <h3 className="text-sm font-bold text-gray-200">{item.title}</h3>
                  <p className="text-xs text-gray-400 font-sans">
                    A recent run of <strong className="text-gray-300">{itemBenchmark?.name || item.benchmarkId}</strong> detected {item.failuresCount} failures and a score drop. Action required:
                  </p>

                  <div className="flex items-center gap-4 text-xs pt-1.5">
                    <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1 rounded">
                      <span className="text-gray-500">Previous Baseline:</span>{' '}
                      <strong className="text-gray-300">{item.previousScore}</strong>
                    </div>
                    <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1 rounded">
                      <span className="text-gray-500">Current Run Score:</span>{' '}
                      <strong className="text-red-400 font-bold">{item.currentScore}</strong>
                    </div>
                    <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1 rounded">
                      <span className="text-gray-500">Score Decline:</span>{' '}
                      <strong className="text-red-500 font-bold">{parseFloat((item.currentScore - item.previousScore).toFixed(2))}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 self-end md:self-center">
                  <button
                    onClick={() => onApprove(item.id)}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-all flex items-center gap-1 shadow-md hover:scale-[1.02]"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Approve Run</span>
                  </button>
                  <button
                    onClick={() => onReject(item.id)}
                    className="bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/60 text-xs font-bold px-3 py-1.5 rounded transition-all flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject Run</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
