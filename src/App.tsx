import React, { useEffect, useState, useRef } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { Sidebar } from './components/Sidebar';
import { TerminalPanel } from './components/TerminalPanel';
import { BrowserPreview } from './components/BrowserPreview';
import { LogsPanel } from './components/LogsPanel';
import { SafetyDialog } from './components/SafetyDialog';
import { X, Play, Square, RefreshCw, FolderOpen, Code, ExternalLink } from 'lucide-react';

export const App: React.FC = () => {
  const {
    init,
    activeWorkspace,
    terminalSessions,
    activeTerminalTabId,
    setActiveTerminalTabId,
    killTerminal,
    ollamaStatus,
    workspaceObservability,
    executeWorkspaceCommand,
    managedProcesses,
    stopManagedProcess,
    restartManagedProcess,
    openWorkspaceInIDE,
    terminalWidthPercent,
    logsHeightPercent,
    updatePanelDimensions
  } = useWorkspaceStore();

  const [currentTab, setCurrentTab] = useState('terminals');
  const [localTerminalWidth, setLocalTerminalWidth] = useState(terminalWidthPercent);
  const [localLogsHeight, setLocalLogsHeight] = useState(logsHeightPercent);

  const localTerminalWidthRef = useRef(terminalWidthPercent);
  const localLogsHeightRef = useRef(logsHeightPercent);

  useEffect(() => {
    setLocalTerminalWidth(terminalWidthPercent);
    localTerminalWidthRef.current = terminalWidthPercent;
  }, [terminalWidthPercent]);

  useEffect(() => {
    setLocalLogsHeight(logsHeightPercent);
    localLogsHeightRef.current = logsHeightPercent;
  }, [logsHeightPercent]);

  const horizontalContainerRef = useRef<HTMLDivElement | null>(null);
  const verticalContainerRef = useRef<HTMLDivElement | null>(null);

  const isDraggingHorizRef = useRef(false);
  const isDraggingVertRef = useRef(false);

  // Horizontal Dragging
  const handleHorizontalMouseMove = (e: MouseEvent) => {
    if (!isDraggingHorizRef.current || !horizontalContainerRef.current) return;
    const rect = horizontalContainerRef.current.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    if (percent >= 20 && percent <= 80) {
      setLocalTerminalWidth(percent);
      localTerminalWidthRef.current = percent;
    }
  };

  const stopHorizontalDrag = () => {
    isDraggingHorizRef.current = false;
    document.removeEventListener('mousemove', handleHorizontalMouseMove);
    document.removeEventListener('mouseup', stopHorizontalDrag);
    updatePanelDimensions(localTerminalWidthRef.current, localLogsHeightRef.current);
  };

  const startHorizontalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHorizRef.current = true;
    document.addEventListener('mousemove', handleHorizontalMouseMove);
    document.addEventListener('mouseup', stopHorizontalDrag);
  };

  // Vertical Dragging
  const handleVerticalMouseMove = (e: MouseEvent) => {
    if (!isDraggingVertRef.current || !verticalContainerRef.current) return;
    const rect = verticalContainerRef.current.getBoundingClientRect();
    const percent = ((rect.bottom - e.clientY) / rect.height) * 100;
    if (percent >= 8 && percent <= 55) {
      setLocalLogsHeight(percent);
      localLogsHeightRef.current = percent;
    }
  };

  const stopVerticalDrag = () => {
    isDraggingVertRef.current = false;
    document.removeEventListener('mousemove', handleVerticalMouseMove);
    document.removeEventListener('mouseup', stopVerticalDrag);
    updatePanelDimensions(localTerminalWidthRef.current, localLogsHeightRef.current);
  };

  const startVerticalDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingVertRef.current = true;
    document.addEventListener('mousemove', handleVerticalMouseMove);
    document.addEventListener('mouseup', stopVerticalDrag);
  };

  const resetHorizontal = () => {
    setLocalTerminalWidth(50);
    localTerminalWidthRef.current = 50;
    updatePanelDimensions(50, localLogsHeightRef.current);
  };

  const resetVertical = () => {
    setLocalLogsHeight(22);
    localLogsHeightRef.current = 22;
    updatePanelDimensions(localTerminalWidthRef.current, 22);
  };

  useEffect(() => {
    init();
    return () => {
      document.removeEventListener('mousemove', handleHorizontalMouseMove);
      document.removeEventListener('mouseup', stopHorizontalDrag);
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mouseup', stopVerticalDrag);
    };
  }, []);

  const activeWorkspaceObs = workspaceObservability[activeWorkspace?.id || ''] || {
    apiOnline: false,
    port: 80,
    runsCount: 0
  };

  const activeTerminalSession = terminalSessions.find(s => s.id === activeTerminalTabId);

  return (
    <div className="flex h-screen w-screen bg-[#0B0F14] text-[#E5E7EB] font-sans overflow-hidden select-none">
      
      {/* 1. Left Switcher Sidebar Panel */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* 2. Main Dashboard Observer Context */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Observability Health Cards Strip */}
        <div className="bg-[#0e131f] border-b border-[#1F2937] px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex-1 flex items-center gap-4 overflow-x-auto min-w-0">
            
            {/* Scope Badge */}
            <div className="flex items-center gap-1.5 bg-[#111827] px-2.5 py-1 rounded border border-[#1f2937] shrink-0 font-mono text-xs">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider font-semibold">Scope:</span>
              <span className="text-blue-400 font-bold uppercase">{activeWorkspace?.name || 'Loading'}</span>
            </div>

            {/* API Observability Check */}
            <div className="flex items-center gap-1.5 bg-[#111827] px-2.5 py-1 rounded border border-[#1f2937] shrink-0 font-mono text-xs">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider font-semibold">TM4 API:</span>
              <span className={`w-1.5 h-1.5 rounded-full ${activeWorkspaceObs.apiOnline ? 'bg-[#22C55E] glow-green' : 'bg-gray-600'}`} />
              <span className={activeWorkspaceObs.apiOnline ? 'text-green-400 font-bold uppercase' : 'text-gray-500 uppercase'}>
                {activeWorkspaceObs.apiOnline ? 'HEALTHY' : 'OFFLINE'}
              </span>
            </div>

            {/* Ollama GPU check */}
            <div className="flex items-center gap-1.5 bg-[#111827] px-2.5 py-1 rounded border border-[#1f2937] shrink-0 font-mono text-xs">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider font-semibold">Ollama:</span>
              <span className={`w-1.5 h-1.5 rounded-full ${ollamaStatus.running ? 'bg-[#22C55E] glow-green' : 'bg-[#EF4444]'}`} />
              <span className={ollamaStatus.running ? 'text-green-400 font-bold uppercase' : 'text-red-500 font-bold uppercase'}>
                {ollamaStatus.running ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            {/* SSH/VPS status check */}
            <div className="flex items-center gap-1.5 bg-[#111827] px-2.5 py-1 rounded border border-[#1f2937] shrink-0 font-mono text-xs">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider font-semibold">VPS state:</span>
              <span className={`w-1.5 h-1.5 rounded-full ${activeWorkspace?.id === 'vps' || activeWorkspace?.id === 'vps-ssh' ? 'bg-[#22C55E] glow-green' : 'bg-gray-600'}`} />
              <span className={activeWorkspace?.id === 'vps' || activeWorkspace?.id === 'vps-ssh' ? 'text-green-400 font-bold uppercase' : 'text-gray-500 uppercase'}>
                {activeWorkspace?.id === 'vps' || activeWorkspace?.id === 'vps-ssh' ? 'CONNECTED' : 'STANDBY'}
              </span>
            </div>

            {/* Running Shell executable */}
            <div className="flex items-center gap-1.5 bg-[#111827] px-2.5 py-1 rounded border border-[#1f2937] shrink-0 font-mono text-xs">
              <span className="text-gray-500 uppercase text-[9px] tracking-wider font-semibold">Shell:</span>
              <span className="text-blue-400 font-semibold uppercase">{activeTerminalSession?.name || 'None'}</span>
            </div>

            {/* Workspace Labeled Startup Commands Actions */}
            {activeWorkspace?.commands && activeWorkspace.commands.length > 0 && (
              <div className="flex items-center gap-1.5 pl-3 border-l border-[#1F2937] shrink-0">
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Actions:</span>
                {activeWorkspace.commands.map((cmd) => {
                  const runningProc = managedProcesses.find(
                    (p) => p.commandId === cmd.id && p.workspaceId === activeWorkspace.id && (p.status === 'running' || p.status === 'starting')
                  );
                  const isRunning = !!runningProc;

                  return (
                    <div key={cmd.id} className="flex items-center gap-1">
                      {isRunning ? (
                        <div className="flex items-center gap-1 bg-[#22c55e]/10 border border-[#22c55e]/30 px-1.5 py-0.5 rounded text-[10px] font-mono select-none">
                          <span className="w-1.5 h-1.5 bg-[#22C55E] rounded-full animate-ping mr-1" />
                          <span className="text-green-400 mr-2 truncate max-w-[80px]">{cmd.label}</span>
                          
                          {/* Restart Action */}
                          <button
                            onClick={() => restartManagedProcess(runningProc.id)}
                            className="text-amber-500 hover:text-amber-400 p-0.5"
                            title="Restart service"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                          
                          {/* Stop Action */}
                          <button
                            onClick={() => stopManagedProcess(runningProc.id)}
                            className="text-red-500 hover:text-red-400 p-0.5"
                            title="Stop service"
                          >
                            <Square className="w-3 h-3 fill-red-500" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => executeWorkspaceCommand(cmd.id)}
                          className="bg-blue-950/20 hover:bg-blue-900/40 text-blue-400 hover:text-blue-300 border border-blue-900/40 px-2 py-0.5 rounded text-[10px] font-mono transition-colors font-medium flex items-center gap-1 shrink-0"
                          title={`Start "${cmd.command}"`}
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>{cmd.label}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* IDE Integrations Action Strip */}
          {activeWorkspace && (
            <div className="flex items-center gap-1 shrink-0 font-mono text-[9px]">
              <span className="text-gray-600 uppercase">IDE:</span>
              <button
                onClick={() => openWorkspaceInIDE('vscode')}
                className="hover:text-blue-400 hover:bg-gray-800/60 p-1.5 rounded transition-colors"
                title="Open in VS Code"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openWorkspaceInIDE('cursor')}
                className="hover:text-blue-400 hover:bg-gray-800/60 p-1.5 rounded transition-colors"
                title="Open in Cursor"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openWorkspaceInIDE('antigravity')}
                className="hover:text-blue-400 hover:bg-gray-800/60 p-1.5 rounded transition-colors text-blue-500 font-bold px-1"
                title="Open in Antigravity Agent Workspace"
              >
                AG
              </button>
              <button
                onClick={() => openWorkspaceInIDE('folder')}
                className="hover:text-blue-400 hover:bg-gray-800/60 p-1.5 rounded transition-colors"
                title="Open Folder in File Explorer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Center Panels view */}
        <div ref={verticalContainerRef} className="flex-1 overflow-hidden p-3 min-h-0 flex flex-col gap-0 select-none">
          {currentTab === 'logs' ? (
            <div className="flex-1 min-h-0">
              <LogsPanel />
            </div>
          ) : (
            // High Density Resizable Split layout
            <>
              {/* Middle Grid Section */}
              <div 
                ref={horizontalContainerRef} 
                className="flex flex-row min-h-0 w-full"
                style={{ height: `${100 - localLogsHeight}%` }}
              >
                
                {/* Left Half: Terminal Tabs container */}
                <div 
                  className="flex flex-col bg-[#111827]/40 border border-[#1F2937] rounded overflow-hidden min-w-0 h-full"
                  style={{ width: `${localTerminalWidth}%` }}
                >
                  
                  {/* Tab row */}
                  <div className="bg-[#111827] border-b border-[#1F2937] px-2 py-1 flex items-center justify-between">
                    <div className="flex items-center gap-1 overflow-x-auto max-w-[85%]">
                      {terminalSessions.map((session) => {
                        const isActive = activeTerminalTabId === session.id;
                        return (
                          <div
                            key={session.id}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs font-mono transition-all border-b-2 cursor-pointer ${
                              isActive
                                ? 'bg-[#0B0F14] text-blue-400 border-blue-500'
                                : 'text-gray-500 hover:text-gray-300 border-transparent'
                            }`}
                            onClick={() => setActiveTerminalTabId(session.id)}
                          >
                            <span className="truncate max-w-[90px]">{session.name}</span>
                            <span className="text-[7.5px] opacity-40 bg-gray-900 px-1 rounded uppercase">
                              {session.type === 'node-pty' ? 'pty' : 'spawn'}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                killTerminal(session.id);
                              }}
                              className="text-gray-600 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {terminalSessions.length === 0 && (
                      <span className="text-[10px] text-gray-600 font-mono italic px-2">
                        No active TTY shells
                      </span>
                    )}
                  </div>

                  {/* Terminal session canvases */}
                  <div className="flex-1 min-h-0 bg-[#0B0F14] relative">
                    {terminalSessions.length === 0 ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 italic text-xs">
                        All terminal tabs closed. Create another shell from the sidebar.
                      </div>
                    ) : (
                      terminalSessions.map((session) => (
                        <TerminalPanel
                          key={session.id}
                          terminalId={session.id}
                          isActive={activeTerminalTabId === session.id}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Horizontal Resize Handle */}
                <div 
                  onMouseDown={startHorizontalDrag}
                  onDoubleClick={resetHorizontal}
                  className="w-1.5 hover:w-2 h-full bg-[#1F2937]/45 hover:bg-blue-500/50 cursor-col-resize transition-all rounded shrink-0 flex items-center justify-center group mx-1.5"
                  title="Double-click to reset to 50%"
                >
                  <div className="w-0.5 h-12 bg-gray-700/60 group-hover:bg-blue-300 rounded" />
                </div>

                {/* Right Half: Sandboxed Visual Preview */}
                <div 
                  className="flex flex-col min-w-0 h-full"
                  style={{ width: `${100 - localTerminalWidth}%` }}
                >
                  <BrowserPreview />
                </div>

              </div>

              {/* Vertical Resize Handle */}
              <div 
                onMouseDown={startVerticalDrag}
                onDoubleClick={resetVertical}
                className="h-1.5 hover:h-2 w-full bg-[#1F2937]/45 hover:bg-blue-500/50 cursor-row-resize transition-all rounded shrink-0 flex items-center justify-center group my-1.5"
                title="Double-click to reset to 22%"
              >
                <div className="h-0.5 w-12 bg-gray-700/60 group-hover:bg-blue-300 rounded" />
              </div>

              {/* Bottom Section: Persistent Logs */}
              <div 
                className="shrink-0 min-h-[50px] w-full"
                style={{ height: `${localLogsHeight}%` }}
              >
                <LogsPanel />
              </div>
            </>
          )}
        </div>

      </div>

      {/* Global Safety dialog interception modal */}
      <SafetyDialog />
    </div>
  );
};
export default App;
