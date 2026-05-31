import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { ShieldAlert, Cpu, Info, CheckCircle2, Terminal } from 'lucide-react';

export const LogsPanel: React.FC = () => {
  const { systemLogs, runtimeLogs } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState<'safety' | 'runtime' | 'process'>('process');

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
      case 'error':
        return <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />;
      case 'warning':
        return <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  const getLogColorClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-amber-400 font-medium';
      default:
        return 'text-gray-300';
    }
  };

  const formatTimestamp = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  // Log filter predicates
  const isSafetyLog = (msg: string) => msg.includes('Blocked') || msg.includes('Safety Gate');
  
  const safetyLogs = systemLogs.filter((log) => isSafetyLog(log.message));
  const processLogs = systemLogs.filter((log) => !isSafetyLog(log.message));

  const getFilteredLogs = () => {
    switch (activeTab) {
      case 'safety':
        return safetyLogs;
      case 'runtime':
        return runtimeLogs;
      case 'process':
        return processLogs;
      default:
        return [];
    }
  };

  const filteredLogs = getFilteredLogs();

  return (
    <div className="h-full flex flex-col bg-[#0B0F14] border border-[#1F2937] rounded overflow-hidden">
      
      {/* Header section with tab switcher */}
      <div className="bg-[#111827] border-b border-[#1F2937] px-4 py-2 flex items-center justify-between flex-wrap gap-2 shrink-0">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('safety')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-colors ${
              activeTab === 'safety'
                ? 'bg-red-950/30 text-red-400 border border-red-900/40 font-semibold'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Safety Logs ({safetyLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('runtime')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-colors ${
              activeTab === 'runtime'
                ? 'bg-amber-950/20 text-amber-400 border border-amber-900/30 font-semibold'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Runtime Logs ({runtimeLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('process')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-colors ${
              activeTab === 'process'
                ? 'bg-blue-950/30 text-blue-400 border border-blue-900/40 font-semibold'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Process Events ({processLogs.length})</span>
          </button>
        </div>

        <div className="text-[10px] text-gray-600 font-mono">
          OPERATOR FEED
        </div>
      </div>

      {/* Logs output list viewport */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-2 bg-[#0B0F14]">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 italic">
            No events logged in this tab.
          </div>
        ) : activeTab === 'runtime' ? (
          (filteredLogs as any[]).map((log, idx) => (
            <div 
              key={idx} 
              className="p-1 px-2 rounded border border-transparent flex items-center gap-2.5 transition-all hover:bg-[#111827]/60 bg-[#111827]/10"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[9.5px] bg-[#1E293B] text-blue-300 border border-blue-900/50 px-1 py-0.5 rounded font-bold uppercase shrink-0 font-sans">
                    {log.tabName}
                  </span>
                  <span className="text-gray-300 break-all truncate flex-1">
                    {log.message}
                  </span>
                </div>
                <span className="text-[9px] text-gray-600 shrink-0 font-sans">
                  {formatTimestamp(log.timestamp)}
                </span>
              </div>
            </div>
          ))
        ) : (
          (filteredLogs as any[]).map((log, idx) => (
            <div 
              key={log.timestamp || idx} 
              className={`p-2 rounded border flex items-start gap-2.5 transition-all hover:bg-[#111827]/60 ${
                log.message.includes('Blocked') 
                  ? 'bg-red-950/5 border-red-950/20' 
                  : 'bg-[#111827]/30 border-gray-900/50'
              }`}
            >
              {getLogIcon(log.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`break-all ${getLogColorClass(log.type)}`}>
                    {log.message}
                  </span>
                  <span className="text-[9px] text-gray-600 shrink-0">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
                {log.workspaceId && (
                  <span className="mt-1 inline-block text-[8px] bg-gray-950 border border-gray-900/80 text-gray-500 px-1 rounded uppercase font-sans">
                    Scope: {log.workspaceId}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

