import React from 'react';
import { PromotionHistoryRecord } from '../../types/evals';

/**
 * Presentational Promotion History tab, extracted verbatim from
 * EvaluationsView.tsx (W6-1 part 5). Behavior-preserving: the JSX (markup,
 * classNames, labels, empty state, timeline rows) is unchanged.
 *
 * This tab is read-only — it renders the `promotions` audit trail and has no
 * callbacks or local state. The parent shell still owns all state and store
 * hook usage; this component receives only the `promotions` array it renders.
 */
export interface PromotionHistoryTabProps {
  promotions: PromotionHistoryRecord[];
}

export const PromotionHistoryTab: React.FC<PromotionHistoryTabProps> = ({ promotions }) => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold font-mono text-gray-200">Baseline Promotion History Log</h2>
        <p className="text-xs text-gray-500">Audit trail timeline of promoted benchmark baseline score thresholds.</p>
      </div>

      {promotions.length === 0 ? (
        <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
          No baseline promotion events logged.
        </div>
      ) : (
        <div className="space-y-2">
          {promotions.map((p, idx) => (
            <div key={idx} className="p-3 bg-[#111827]/30 border border-gray-800 rounded font-mono text-xs space-y-1.5">
              <div className="flex justify-between items-center text-[10px] text-gray-500">
                <span>{new Date(p.timestamp).toLocaleString()}</span>
                {p.runId && (
                  <span className="bg-gray-900 border border-gray-850 px-1.5 py-0.2 rounded text-blue-400">
                    Source Run: {p.runId.slice(-6)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-200">{p.benchmarkName}</span>
                <div className="flex items-center gap-1.5 bg-[#0B0F14] border border-gray-800 px-2 py-0.5 rounded">
                  <span className="text-gray-500">{p.oldScore}</span>
                  <span className="text-gray-500">&rarr;</span>
                  <span className="text-green-400 font-bold">{p.newScore}</span>
                </div>
              </div>

              {p.reason && (
                <div className="text-[11px] text-gray-400 italic bg-[#0B0F14]/40 p-2 rounded border border-gray-900/60 font-sans">
                  &ldquo;{p.reason}&rdquo;
                </div>
              )}

              <div className="text-[9px] text-gray-500">
                Governance Approval: <strong className="text-gray-400 uppercase">{p.approvedBy}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
