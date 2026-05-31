import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  History, 
  Activity, 
  Terminal, 
  Settings, 
  User, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  Search
} from 'lucide-react';
import { TimelineEvent } from '../types/timeline';

interface TimelineViewProps {
  onReplaySelect?: (eventId: string) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ onReplaySelect }) => {
  const { timelineEvents, activeWorkspace } = useWorkspaceStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  if (!activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 font-mono">
        No active workspace selected.
      </div>
    );
  }

  // Filter events
  const filteredEvents = timelineEvents.filter((ev) => {
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSummary = ev.summary.toLowerCase().includes(q);
      const matchType = ev.type.toLowerCase().includes(q);
      const matchActor = ev.actor.toLowerCase().includes(q);
      if (!matchSummary && !matchType && !matchActor) return false;
    }

    // Type filter
    if (selectedType !== 'all') {
      if (selectedType === 'evals') {
        const isEval = [
          'regression_executed',
          'failure_converted',
          'run_approved',
          'run_rejected',
          'baseline_promoted'
        ].includes(ev.type);
        if (!isEval) return false;
      } else if (selectedType === 'services') {
        const isService = ['service_started', 'service_stopped'].includes(ev.type);
        if (!isService) return false;
      } else if (selectedType === 'manifest') {
        if (ev.type !== 'manifest_saved') return false;
      }
    }

    // Severity filter
    if (selectedSeverity !== 'all' && ev.severity !== selectedSeverity) {
      return false;
    }

    return true;
  });

  const getEventIcon = (type: TimelineEvent['type'], severity: TimelineEvent['severity']) => {
    const baseClass = "w-4 h-4";
    switch (type) {
      case 'service_started':
      case 'service_stopped':
        return <Terminal className={`${baseClass} text-blue-400`} />;
      case 'manifest_saved':
        return <Settings className={`${baseClass} text-purple-400`} />;
      case 'failure_converted':
      case 'baseline_promoted':
      case 'run_approved':
        return <CheckCircle2 className={`${baseClass} text-green-400`} />;
      case 'run_rejected':
        return <AlertTriangle className={`${baseClass} text-amber-500`} />;
      default:
        if (severity === 'warning' || severity === 'error') {
          return <AlertTriangle className={`${baseClass} text-red-400`} />;
        }
        return <Activity className={`${baseClass} text-gray-400`} />;
    }
  };

  const getSeverityBadgeClass = (severity: TimelineEvent['severity']) => {
    switch (severity) {
      case 'success':
        return 'bg-green-950/40 text-green-400 border-green-900/40';
      case 'warning':
        return 'bg-amber-950/40 text-amber-400 border-amber-900/40';
      case 'error':
        return 'bg-red-950/40 text-red-400 border-red-900/40';
      default:
        return 'bg-blue-950/40 text-blue-400 border-blue-900/40';
    }
  };

  const formatEventType = (type: string) => {
    return type.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      
      {/* 1. Header with details */}
      <div className="flex justify-between items-center border-b border-gray-900 pb-2 shrink-0">
        <div>
          <h2 className="text-sm font-bold font-mono text-gray-200 flex items-center gap-1.5">
            <History className="w-4 h-4 text-blue-500" />
            <span>Workspace Timeline Stream</span>
          </h2>
          <p className="text-xs text-gray-500">Real-time chronicle of runs, model validations, and process state changes.</p>
        </div>
      </div>

      {/* 2. Search & Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#111827]/40 p-3 rounded-lg border border-gray-800 shrink-0 font-mono text-xs">
        <div className="relative md:col-span-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search events, actor, or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none pl-8 pr-3 py-2 rounded text-gray-300 placeholder-gray-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-500 uppercase text-[9px] font-bold shrink-0">Type:</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
          >
            <option value="all">ALL EVENTS</option>
            <option value="evals">EVALUATIONS</option>
            <option value="services">SERVICES</option>
            <option value="manifest">MANIFEST EDITS</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-500 uppercase text-[9px] font-bold shrink-0">Severity:</span>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
          >
            <option value="all">ALL SEVERITIES</option>
            <option value="info">INFO</option>
            <option value="success">SUCCESS</option>
            <option value="warning">WARNING</option>
            <option value="error">ERROR</option>
          </select>
        </div>
      </div>

      {/* 3. Chronological Vertical Timeline Axis */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10 font-mono">
            No timeline matches found. Initiate operations to generate audit stream logs.
          </div>
        ) : (
          <div className="relative border-l border-gray-800/80 ml-4 pl-6 space-y-4 font-mono text-xs py-2">
            
            {filteredEvents.map((ev) => {
              const isExpanded = expandedEventId === ev.id;
              const hasSnapshot = !!ev.metadata;

              return (
                <div key={ev.id} className="relative group">
                  
                  {/* Circle Indicator on Axis */}
                  <span className="absolute -left-[31px] top-1 bg-[#0B0F14] border border-gray-800 w-4 h-4 rounded-full flex items-center justify-center group-hover:border-blue-500 transition-colors z-10">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/80" />
                  </span>

                  {/* Card Event Content */}
                  <div className="p-3.5 bg-[#111827]/30 hover:bg-[#111827]/50 border border-gray-800 rounded-lg space-y-2 transition-all">
                    
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getEventIcon(ev.type, ev.severity)}
                        <span className="font-bold text-gray-300 uppercase tracking-wide text-[10px]">
                          {formatEventType(ev.type)}
                        </span>
                        
                        <span className={`px-1.5 py-0.2 rounded border text-[8px] font-bold ${getSeverityBadgeClass(ev.severity)}`}>
                          {ev.severity.toUpperCase()}
                        </span>

                        {ev.isSeeded && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-950/20 border border-amber-900/30 text-amber-500 text-[8px] font-bold uppercase tracking-wider">
                            SEEDED SAMPLE
                          </span>
                        )}

                        <span className="text-[10px] text-gray-600 flex items-center gap-1.5">
                          <User className="w-3 h-3" />
                          <span>actor: {ev.actor}</span>
                        </span>
                      </div>

                      <span className="text-[10px] text-gray-500">{new Date(ev.timestamp).toLocaleString()}</span>
                    </div>

                    <div className="text-[11px] text-gray-300 leading-relaxed italic pr-20">
                      "{ev.summary}"
                    </div>

                    {/* Meta Snapshot / Logs Toggle */}
                    <div className="flex justify-between items-center pt-1 border-t border-gray-900/60 mt-2">
                      <div className="flex items-center gap-3">
                        {hasSnapshot && (
                          <button
                            onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                            className="text-gray-500 hover:text-gray-300 font-mono text-[9px] uppercase tracking-wider transition-colors font-bold"
                          >
                            {isExpanded ? 'Hide Payload' : 'Show Payload'}
                          </button>
                        )}
                        
                        {hasSnapshot && (
                          <span className="text-gray-700 text-[9px]">|</span>
                        )}

                        <span className="text-[9px] text-gray-500">ID: {ev.id}</span>
                      </div>

                      {hasSnapshot && onReplaySelect && (
                        <button
                          onClick={() => onReplaySelect(ev.id)}
                          className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1 hover:scale-[1.02]"
                          title="View system metrics and terminal logs snapshot"
                        >
                          <span>Replay Event</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Metadata expanded details */}
                    {isExpanded && ev.metadata && (
                      <div className="mt-2.5 p-2.5 bg-[#0B0F14]/80 border border-gray-850 rounded text-[10px] font-mono space-y-2">
                        <div className="text-blue-500 font-bold uppercase text-[9px] border-b border-gray-900 pb-1">
                          Snapshot Payload Properties
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {ev.metadata.benchmarkScore !== undefined && (
                            <div>
                              <span className="block text-gray-500 uppercase text-[8px]">Score</span>
                              <strong className="text-gray-300 font-bold">{ev.metadata.benchmarkScore}</strong>
                            </div>
                          )}
                          {ev.metadata.baselineScore !== undefined && (
                            <div>
                              <span className="block text-gray-500 uppercase text-[8px]">Baseline</span>
                              <strong className="text-gray-300 font-bold">{ev.metadata.baselineScore}</strong>
                            </div>
                          )}
                          {ev.metadata.passRate !== undefined && (
                            <div>
                              <span className="block text-gray-500 uppercase text-[8px]">Pass Rate</span>
                              <strong className="text-gray-300 font-bold">{ev.metadata.passRate}%</strong>
                            </div>
                          )}
                          {ev.metadata.failuresCount !== undefined && (
                            <div>
                              <span className="block text-gray-500 uppercase text-[8px]">Failures</span>
                              <strong className="text-red-400 font-bold">{ev.metadata.failuresCount}</strong>
                            </div>
                          )}
                        </div>

                        {ev.metadata.logsSnapshot && ev.metadata.logsSnapshot.length > 0 && (
                          <div className="space-y-1">
                            <span className="block text-gray-500 uppercase text-[8px]">Captured Logs Snapshot:</span>
                            <div className="max-h-24 overflow-y-auto bg-black/60 p-2 rounded text-gray-500 font-mono text-[9px] leading-tight space-y-0.5">
                              {ev.metadata.logsSnapshot.map((log: string, idx: number) => (
                                <div key={idx} className="truncate select-text">
                                  {log}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

    </div>
  );
};
export default TimelineView;
