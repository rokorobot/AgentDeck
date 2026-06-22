import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  Terminal, 
  Cpu, 
  FolderOpen, 
  Activity, 
  RefreshCw,
  Layers,
  ChevronRight,
  Plus,
  Sliders,
  History,
  RotateCcw,
  ShieldCheck,
  Archive,
  HeartPulse
} from 'lucide-react';
import { Workspace } from '../types/workspace';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    sidebarWidth,
    ollamaStatus,
    checkOllama,
    createTerminal,
    addWorkspaceFolder,
    workspaceObservability,
    pollPortsHealth,
    executeQuickAction,
    managedProcesses,
    terminalSessions,
    doctorReport
  } = useWorkspaceStore();

  const [customTerminalOpen, setCustomTerminalOpen] = useState(false);
  const [customTermName, setCustomTermName] = useState('');
  const [customTermShell, setCustomTermShell] = useState('powershell.exe');
  const [showModelList, setShowModelList] = useState(false);

  const handleCreateCustomTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTermName.trim()) return;
    
    try {
      const cwd = activeWorkspace ? activeWorkspace.rootPath : 'E:\\AgentDeck';
      await createTerminal(customTermName, customTermShell, cwd);
      setCustomTermName('');
      setCustomTerminalOpen(false);
      setCurrentTab('terminals');
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshObservability = () => {
    pollPortsHealth();
    checkOllama();
  };

  const builtInIds = ['tm4', 'sound-machina', 'robotstore'];
  const builtInWorkspaces = workspaces.filter(w => builtInIds.includes(w.id));
  const discoveredWorkspaces = workspaces.filter(w => !builtInIds.includes(w.id));

  const renderWorkspaceItem = (ws: Workspace) => {
    const isActive = activeWorkspace?.id === ws.id;
    const obs = workspaceObservability[ws.id] || { apiOnline: false, port: 80, runsCount: 0 };
    
    return (
      <div key={ws.id} className="space-y-1">
        <button
          onClick={() => setActiveWorkspace(ws.id)}
          className={`w-full text-left px-3 py-1.5 rounded flex items-center justify-between transition-all group ${
            isActive 
              ? 'bg-[#1F2937] text-gray-100 font-medium border border-blue-500/30 shadow-sm' 
              : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#22C55E] glow-green' : 'bg-gray-600'}`} />
            <span className="truncate max-w-[150px]">{ws.name}</span>
          </div>
          <ChevronRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'text-blue-500' : 'text-gray-500'}`} />
        </button>
        
        {/* Observability parameters display */}
        <div className="pl-5 text-[10px] text-gray-500 font-mono space-y-0.5 border-l border-gray-800/80 ml-3">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-700">├</span>
            <span>API:</span>
            <span className={obs.apiOnline ? 'text-green-400 font-bold' : 'text-gray-600'}>
              {obs.apiOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-700">├</span>
            <span>Port:</span>
            <span className="text-gray-400">{obs.port}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-700">└</span>
            <span>
              {ws.id === 'sound-machina' ? 'Models:' : 'Runs:'}
            </span>
            <span className="text-blue-400">
              {ws.id === 'sound-machina' ? obs.modelCount || 2 : obs.runsCount}
            </span>
          </div>
        </div>

        {/* Quick Actions List */}
        {isActive && ws.quickActions && ws.quickActions.length > 0 && (
          <div className="pl-5 pt-1.5 space-y-1 ml-3 border-l border-gray-800/80">
            <div className="text-[9px] uppercase text-gray-600 font-mono font-bold tracking-wider mb-1">Quick Actions</div>
            <div className="grid grid-cols-1 gap-1">
              {ws.quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => executeQuickAction(action)}
                  className="w-full text-left text-[10px] font-mono text-gray-400 hover:text-blue-400 hover:bg-blue-950/20 border border-transparent hover:border-blue-900/30 px-1.5 py-0.5 rounded transition-all flex items-center gap-1 shrink-0"
                >
                  <span className="text-blue-500 font-bold">›</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const runningServicesCount = managedProcesses.filter(p => p.status === 'running').length;
  const hasPowerShell = terminalSessions.some(s => s.name.toLowerCase().includes('powershell') || s.shell.toLowerCase().includes('powershell'));
  const hasWSL = terminalSessions.some(s => s.name.toLowerCase().includes('wsl') || s.shell.toLowerCase().includes('wsl'));
  const totalProcessesCount = terminalSessions.length + runningServicesCount;

  const isPort3000Online = !!workspaceObservability['sound-machina']?.apiOnline;
  const isPort8000Online = !!workspaceObservability['tm4']?.apiOnline;
  const isPort5173Online = !!workspaceObservability['robotstore']?.apiOnline;

  return (
    <div 
      className="bg-[#111827] border-r border-[#1F2937] flex flex-col h-full font-sans select-none shrink-0"
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* Brand Header */}
      <div className="p-4 border-b border-[#1F2937] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-500" />
          <span className="font-semibold text-gray-200 tracking-wide text-sm font-sans uppercase">
            AgentDeck v0.2
          </span>
        </div>
        <button 
          onClick={handleRefreshObservability} 
          className="text-gray-500 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-800"
          title="Refresh Observability telemetry"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Sections */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        
        {/* Built-in Presets */}
        <div>
          <div className="text-[11px] font-mono text-gray-500 uppercase tracking-wider mb-2 px-2">
            <span>Workspace Presets</span>
          </div>
          <div className="space-y-3">
            {builtInWorkspaces.map(renderWorkspaceItem)}
          </div>
        </div>

        {/* Dynamic Discovered Projects */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-500 uppercase tracking-wider mb-2 px-2">
            <span>Discovered Projects</span>
            <button
              type="button"
              onClick={addWorkspaceFolder}
              className="text-gray-500 hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-800/30"
              title="Add Workspace Project Folder"
            >
              <FolderOpen className="w-3.5 h-3.5 pointer-events-none" />
            </button>
          </div>
          <div className="space-y-3">
            {discoveredWorkspaces.length === 0 ? (
              <button
                type="button"
                onClick={addWorkspaceFolder}
                className="w-full text-left text-[10px] text-gray-600 hover:text-gray-400 hover:bg-gray-900/50 hover:border-gray-800 transition-colors font-mono italic px-3 py-2 bg-gray-900/30 rounded border border-gray-900 border-dashed cursor-pointer"
              >
                No active directories. Click folder to discover.
              </button>
            ) : (
              discoveredWorkspaces.map(renderWorkspaceItem)
            )}
          </div>
        </div>

        {/* Views navigation */}
        <div>
          <div className="text-[11px] font-mono text-gray-500 uppercase tracking-wider mb-2 px-2">
            <span>Views</span>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => setCurrentTab('terminals')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'terminals' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Shell Console</span>
            </button>
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'dashboard' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Runtime Dashboard</span>
            </button>
            <button
              onClick={() => setCurrentTab('evaluations')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'evaluations' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>Evaluations</span>
            </button>
            <button
              onClick={() => setCurrentTab('timeline')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'timeline' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <History className="w-4 h-4 text-blue-400" />
              <span>Timeline</span>
            </button>
            <button
              onClick={() => setCurrentTab('replay')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'replay' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-teal-400" />
              <span>Replay</span>
            </button>
            <button
              onClick={() => setCurrentTab('governance')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'governance' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Governance</span>
            </button>
            <button
              onClick={() => setCurrentTab('snapshots')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'snapshots' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <Archive className="w-4 h-4 text-blue-400" />
              <span>Snapshot Engine</span>
            </button>
            <button
              onClick={() => setCurrentTab('doctor')}
              className={`w-full text-left px-3 py-2 rounded flex items-center justify-between text-sm transition-all ${
                currentTab === 'doctor' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <HeartPulse className={`w-4 h-4 ${
                  doctorReport?.status === 'critical' ? 'text-red-500 animate-pulse' :
                  doctorReport?.status === 'warning' ? 'text-amber-500' :
                  'text-blue-400'
                }`} />
                <span>Workspace Doctor</span>
              </div>
              {doctorReport && doctorReport.status !== 'healthy' && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  doctorReport.status === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse' : 'bg-amber-500'
                }`} />
              )}
            </button>
            <button
              onClick={() => setCurrentTab('editor')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2.5 text-sm transition-all ${
                currentTab === 'editor' 
                  ? 'bg-blue-950/40 text-blue-400 border-l-2 border-blue-500 font-medium' 
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Manifest Editor</span>
            </button>
          </div>
        </div>

        {/* Custom Terminal Launcher */}
        <div>
          <button 
            onClick={() => setCustomTerminalOpen(!customTerminalOpen)}
            className="w-full py-1.5 border border-dashed border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Launch Custom Shell</span>
          </button>
          
          {customTerminalOpen && (
            <form onSubmit={handleCreateCustomTerminal} className="mt-2 p-2 bg-gray-900/50 rounded border border-gray-800 space-y-2">
              <div>
                <label className="block text-[10px] text-gray-500 font-mono uppercase mb-0.5">Shell Name</label>
                <input 
                  type="text" 
                  value={customTermName} 
                  onChange={(e) => setCustomTermName(e.target.value)}
                  placeholder="e.g. Git Bash"
                  className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-2 py-1 text-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 font-mono uppercase mb-0.5">Shell Executable</label>
                <select 
                  value={customTermShell} 
                  onChange={(e) => setCustomTermShell(e.target.value)}
                  className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-2 py-1 text-gray-300 rounded"
                >
                  <option value="powershell.exe">PowerShell</option>
                  <option value="cmd.exe">CMD</option>
                  <option value="wsl.exe">WSL Ubuntu</option>
                </select>
              </div>
              <button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded text-xs py-1 transition-colors font-medium"
              >
                Spawn Session
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Operator Status Widget footer */}
      <div className="p-3 border-t border-[#1F2937] bg-[#0d131f]/60 space-y-2 text-xs">
        
        {/* Runtime Dashboard Card */}
        <div className="p-2 rounded bg-[#0B0F14] border border-gray-800 space-y-1.5 font-mono">
          <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider flex items-center gap-1.5 border-b border-gray-900 pb-1">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>Runtime Dashboard</span>
          </div>
          
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Services:</span>
              <span className="text-blue-400 font-bold">{runningServicesCount}</span>
            </div>
            
            <div className="space-y-0.5 border-l border-gray-800/80 pl-2 ml-1">
              <div className="flex justify-between">
                <span className="text-gray-500">PowerShell:</span>
                <span className={hasPowerShell ? 'text-green-400 font-bold' : 'text-gray-600'}>
                  {hasPowerShell ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">WSL:</span>
                <span className={hasWSL ? 'text-green-400 font-bold' : 'text-gray-600'}>
                  {hasWSL ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ollama:</span>
                <span className={ollamaStatus.running ? 'text-green-400 font-bold' : 'text-red-500 font-bold'}>
                  {ollamaStatus.running ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="flex justify-between pt-1 border-t border-gray-950">
              <span className="text-gray-500">Memory:</span>
              <span className="text-gray-400">N/A</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-500">Processes:</span>
              <span className="text-blue-400 font-bold">{totalProcessesCount}</span>
            </div>

            <div className="pt-1 border-t border-gray-950">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Ports:</div>
              <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                <div className={`p-0.5 rounded border ${isPort3000Online ? 'bg-green-950/20 text-green-400 border-green-900/40 font-bold' : 'bg-gray-950/40 text-gray-600 border-transparent'}`}>
                  3000 {isPort3000Online ? '✓' : '×'}
                </div>
                <div className={`p-0.5 rounded border ${isPort8000Online ? 'bg-green-950/20 text-green-400 border-green-900/40 font-bold' : 'bg-gray-950/40 text-gray-600 border-transparent'}`}>
                  8000 {isPort8000Online ? '✓' : '×'}
                </div>
                <div className={`p-0.5 rounded border ${isPort5173Online ? 'bg-green-950/20 text-green-400 border-green-900/40 font-bold' : 'bg-gray-950/40 text-gray-600 border-transparent'}`}>
                  5173 {isPort5173Online ? '✓' : '×'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ollama Status Widget */}
        <div className="p-2 rounded bg-[#0B0F14] border border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-mono text-[10px] uppercase font-semibold">Ollama Status</span>
            </div>
            <button 
              onClick={checkOllama} 
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Refresh models"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Local Service</span>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${ollamaStatus.running ? 'bg-[#22C55E] glow-green' : 'bg-[#EF4444]'}`} />
              <span className={`font-mono text-[9px] uppercase font-bold ${ollamaStatus.running ? 'text-green-400' : 'text-red-400'}`}>
                {ollamaStatus.running ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          {ollamaStatus.running && (
            <div className="mt-2 pt-1.5 border-t border-gray-900">
              <button 
                onClick={() => setShowModelList(!showModelList)} 
                className="w-full text-left text-[10px] text-gray-500 hover:text-gray-300 flex items-center justify-between"
              >
                <span>Models ({ollamaStatus.models.length})</span>
                <span className="text-[8px]">{showModelList ? '▼' : '►'}</span>
              </button>
              
              {showModelList && (
                <div className="mt-1 max-h-20 overflow-y-auto font-mono text-[9px] text-blue-400 space-y-0.5">
                  {ollamaStatus.models.length === 0 ? (
                    <div className="text-gray-600 italic">No models found.</div>
                  ) : (
                    ollamaStatus.models.map((model) => (
                      <div key={model} className="px-1 py-0.5 bg-gray-950/40 rounded truncate border border-gray-950">
                        {model}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
