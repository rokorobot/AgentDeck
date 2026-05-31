import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  RotateCcw, 
  Clock, 
  Terminal, 
  Activity
} from 'lucide-react';

interface ReplayViewProps {
  selectedEventId?: string | null;
}

export const ReplayView: React.FC<ReplayViewProps> = ({ selectedEventId: initialSelectedId }) => {
  const { timelineEvents, activeWorkspace } = useWorkspaceStore();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
    } else if (timelineEvents.length > 0 && !selectedId) {
      // Find the first event that contains a snapshot to pre-select
      const firstSnapshot = timelineEvents.find(e => e.metadata);
      if (firstSnapshot) {
        setSelectedId(firstSnapshot.id);
      } else {
        setSelectedId(timelineEvents[0].id);
      }
    }
  }, [initialSelectedId, timelineEvents]);

  if (!activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 font-mono">
        No active workspace selected.
      </div>
    );
  }

  const selectedEvent = timelineEvents.find(e => e.id === selectedId);

  const formatTypeLabel = (type: string) => {
    return type.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 overflow-hidden select-none">
      
      {/* Sidebar: Replay Markers List */}
      <div className="w-full md:w-80 bg-[#111827]/40 border border-gray-800 rounded-lg flex flex-col overflow-hidden shrink-0 font-mono text-xs">
        <div className="p-3 border-b border-gray-900 bg-[#0e131f] flex items-center gap-1.5 shrink-0">
          <RotateCcw className="w-3.5 h-3.5 text-blue-500 animate-spin-reverse" />
          <span className="font-bold text-gray-300">Replay Points Feed</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {timelineEvents.length === 0 ? (
            <div className="p-4 text-center text-gray-600 italic">
              No historical checkpoints recorded.
            </div>
          ) : (
            timelineEvents.map((ev) => {
              const isActive = ev.id === selectedId;
              const hasSnapshot = !!ev.metadata;

              return (
                <button
                  key={ev.id}
                  onClick={() => setSelectedId(ev.id)}
                  className={`w-full text-left p-2.5 rounded transition-all border flex flex-col gap-1 ${
                    isActive
                      ? 'bg-blue-950/20 text-blue-400 border-blue-900/50'
                      : 'bg-gray-900/30 text-gray-500 hover:text-gray-300 border-transparent hover:bg-gray-900/40'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-bold text-[10px] uppercase truncate max-w-[70%]">
                      {formatTypeLabel(ev.type)}
                    </span>
                    <span className="text-[8px] text-gray-600">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-[10px] text-gray-400 truncate w-full">
                    {ev.summary}
                  </p>

                  <div className="flex justify-between items-center mt-1 w-full text-[8.5px]">
                    <span className="text-gray-600">actor: {ev.actor}</span>
                    {hasSnapshot && (
                      <span className="bg-blue-950/40 text-blue-400 border border-blue-900/40 px-1 rounded font-bold">
                        SNAPSHOT
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Playback Canvas */}
      <div className="flex-1 bg-[#111827]/10 border border-gray-800 rounded-lg flex flex-col overflow-hidden font-mono text-xs">
        {selectedEvent ? (
          <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
            
            {/* Title & Metadata Card */}
            <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-2 relative">
              
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-gray-400">Timestamp Checkpoint:</span>
                  <span className="text-gray-200 font-bold">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
                </div>
                
                {selectedEvent.isSeeded && (
                  <span className="px-2 py-0.5 rounded bg-amber-950/20 border border-amber-900/30 text-amber-500 text-[8px] font-bold uppercase tracking-wider">
                    SEEDED SAMPLE
                  </span>
                )}
              </div>

              <h2 className="text-sm font-bold text-gray-200">
                {selectedEvent.summary}
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1.5 text-[9px] text-gray-500 border-t border-gray-900/50">
                <div>
                  <span className="block uppercase text-[8px]">Event Type:</span>
                  <strong className="text-blue-400 uppercase font-semibold">{selectedEvent.type}</strong>
                </div>
                <div>
                  <span className="block uppercase text-[8px]">Event Severity:</span>
                  <strong className="text-gray-300 uppercase font-semibold">{selectedEvent.severity}</strong>
                </div>
                <div>
                  <span className="block uppercase text-[8px]">Actor Authority:</span>
                  <strong className="text-gray-300 uppercase font-semibold">{selectedEvent.actor}</strong>
                </div>
                <div>
                  <span className="block uppercase text-[8px]">Schema Spec:</span>
                  <strong className="text-gray-400 uppercase font-semibold">{selectedEvent.schemaVersion}</strong>
                </div>
              </div>

            </div>

            {/* Replay State Checks */}
            {!selectedEvent.metadata ? (
              <div className="flex-1 flex items-center justify-center text-center p-8 border border-dashed border-gray-800 rounded-lg bg-gray-950/30">
                <div className="space-y-1">
                  <Activity className="w-8 h-8 text-gray-700 mx-auto" />
                  <div className="text-gray-500 font-bold text-[11px]">No snapshot captured for this event.</div>
                  <p className="text-[10px] text-gray-600 max-w-sm">
                    This timeline marker tracks metadata configurations but did not record logs or metrics during registration.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                
                {/* 1. Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  
                  {selectedEvent.metadata.benchmarkScore !== undefined && (
                    <div className="p-3 bg-[#0B0F14] border border-gray-800 rounded-lg">
                      <span className="block text-[8px] text-gray-500 uppercase">Benchmark Score</span>
                      <div className="text-lg font-bold text-blue-400 mt-0.5">
                        {selectedEvent.metadata.benchmarkScore}
                      </div>
                    </div>
                  )}

                  {selectedEvent.metadata.baselineScore !== undefined && (
                    <div className="p-3 bg-[#0B0F14] border border-gray-800 rounded-lg">
                      <span className="block text-[8px] text-gray-500 uppercase">Baseline Target</span>
                      <div className="text-lg font-bold text-gray-300 mt-0.5">
                        {selectedEvent.metadata.baselineScore}
                      </div>
                    </div>
                  )}

                  {selectedEvent.metadata.passRate !== undefined && (
                    <div className="p-3 bg-[#0B0F14] border border-gray-800 rounded-lg">
                      <span className="block text-[8px] text-gray-500 uppercase">Test Pass Rate</span>
                      <div className="text-lg font-bold text-green-400 mt-0.5">
                        {selectedEvent.metadata.passRate}%
                      </div>
                    </div>
                  )}

                  {selectedEvent.metadata.failuresCount !== undefined && (
                    <div className="p-3 bg-[#0B0F14] border border-gray-800 rounded-lg">
                      <span className="block text-[8px] text-gray-500 uppercase">Validation Faults</span>
                      <div className={`text-lg font-bold mt-0.5 ${selectedEvent.metadata.failuresCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {selectedEvent.metadata.failuresCount}
                      </div>
                    </div>
                  )}

                </div>

                {/* 2. Captured Terminal logs console */}
                <div className="flex-1 flex flex-col overflow-hidden bg-black border border-gray-850 rounded-lg">
                  <div className="bg-[#0b0f19] px-3.5 py-2 border-b border-gray-900 flex items-center gap-2 shrink-0">
                    <Terminal className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="font-bold text-[10px] text-gray-400 uppercase tracking-wider">
                      Terminal Console Logs Snapshot (latest 30 lines max)
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] leading-relaxed text-gray-500 space-y-1.5 select-text bg-[#030712] pr-1">
                    {!selectedEvent.metadata.logsSnapshot || selectedEvent.metadata.logsSnapshot.length === 0 ? (
                      <div className="text-gray-600 italic select-none text-center pt-8">
                        No captured console logs found in this snapshot.
                      </div>
                    ) : (
                      selectedEvent.metadata.logsSnapshot.map((log: string, idx: number) => {
                        const isError = log.includes('[error]') || log.includes('FAILED') || log.includes('error') || log.includes('error:');
                        const isSuccess = log.includes('[success]') || log.includes('PASSED') || log.includes('SUCCESS');
                        
                        return (
                          <div 
                            key={idx} 
                            className={`whitespace-pre-wrap select-text truncate ${
                              isError ? 'text-red-400/90 font-semibold' : isSuccess ? 'text-green-400/90' : 'text-gray-400'
                            }`}
                          >
                            {log}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8 text-gray-500">
            Select check-point event from the side list to inspect snapshot replay.
          </div>
        )}
      </div>

    </div>
  );
};
export default ReplayView;
