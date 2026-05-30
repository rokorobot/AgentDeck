import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export const SafetyDialog: React.FC = () => {
  const { safetyDialog, setSafetyDialog } = useWorkspaceStore();

  if (!safetyDialog || !safetyDialog.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-sans select-none animate-fadeIn">
      {/* Dialog box shell */}
      <div className="bg-[#111827] border border-[#EF4444]/40 max-w-md w-full rounded shadow-2xl overflow-hidden glow-red">
        
        {/* Banner Header */}
        <div className="bg-red-950/40 border-b border-red-900/50 px-4 py-3 flex items-center gap-2 text-red-400">
          <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
          <span className="font-semibold text-xs tracking-wider uppercase font-mono">
            Destructive Command Intercepted
          </span>
        </div>

        {/* Warning Details body */}
        <div className="p-4 space-y-3">
          <p className="text-gray-300 text-xs leading-relaxed">
            {safetyDialog.reason} Executing this command could result in accidental deletion or system instability.
          </p>

          <div className="bg-[#0B0F14] border border-gray-800 p-3 rounded font-mono text-[11px] text-red-400 break-all select-all">
            {safetyDialog.command}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-mono">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Target Terminal ID: {safetyDialog.terminalId}</span>
          </div>
        </div>

        {/* Action Panel Footer */}
        <div className="bg-[#0d131f]/80 px-4 py-3 border-t border-[#1F2937] flex items-center justify-end gap-2.5">
          <button
            onClick={() => {
              safetyDialog.onCancel();
              setSafetyDialog(null);
            }}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-all font-semibold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-gray-600"
          >
            Cancel Execution
          </button>
          
          <button
            onClick={() => {
              safetyDialog.onConfirm();
              setSafetyDialog(null);
            }}
            className="px-3 py-1.5 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded text-xs transition-all font-semibold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            Approve & Execute
          </button>
        </div>
      </div>
    </div>
  );
};
