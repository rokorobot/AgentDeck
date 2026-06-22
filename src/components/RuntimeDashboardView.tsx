import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  Cpu, 
  Activity, 
  RefreshCw, 
  Play, 
  Square, 
  ShieldAlert, 
  Terminal, 
  HardDrive,
  CheckCircle2,
  Clock,
  User,
  Brain,
  Plus,
  Trash2,
  X,
  Sparkles
} from 'lucide-react';
import { AgentTopologyWizard } from './AgentTopologyWizard';

export const RuntimeDashboardView: React.FC = () => {
  const {
    activeWorkspace,
    ollamaStatus,
    workspaceObservability,
    managedProcesses,
    runtimeLogs,
    systemLogs,
    stopManagedProcess,
    restartManagedProcess,
    startManagedProcess,
    checkOllama,
    pollPortsHealth,
    agentSessions,
    addAgent,
    removeAgent,
    startAgentSession,
    stopAgentSession
  } = useWorkspaceStore();

  const [selectedProcessLogId, setSelectedProcessLogId] = useState<string>('all');

  // Agent Form State
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [modelProvider, setModelProvider] = useState('gemini');
  const [modelName, setModelName] = useState('gemini-1.5-pro');
  const [selectedTools, setSelectedTools] = useState<string[]>(['terminal', 'files']);
  const [formError, setFormError] = useState('');
  const [isTopologyWizardOpen, setIsTopologyWizardOpen] = useState(false);

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!agentName.trim()) {
      setFormError('Agent Name is required.');
      return;
    }
    if (!agentRole.trim()) {
      setFormError('Agent Role and responsibilities are required.');
      return;
    }
    if (!modelName.trim()) {
      setFormError('Model Name is required.');
      return;
    }

    try {
      await addAgent(
        agentName,
        agentRole,
        { provider: modelProvider, model: modelName },
        selectedTools as any[]
      );
      
      // Reset form
      setAgentName('');
      setAgentRole('');
      setModelProvider('gemini');
      setModelName('gemini-1.5-pro');
      setSelectedTools(['terminal', 'files']);
      setIsAddAgentOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to assign agent.');
    }
  };

  const runningServicesCount = managedProcesses.filter(p => p.status === 'running').length;
  
  const activeWorkspaceObs = activeWorkspace 
    ? workspaceObservability[activeWorkspace.id] || { apiOnline: false, port: 80, runsCount: 0 }
    : { apiOnline: false, port: 80, runsCount: 0 };

  const isPort3000Online = !!workspaceObservability['sound-machina']?.apiOnline;
  const isPort8000Online = !!workspaceObservability['tm4']?.apiOnline;
  const isPort5173Online = !!workspaceObservability['robotstore']?.apiOnline;

  const isSafetyLog = (msg: string) => msg.includes('Blocked') || msg.includes('Safety Gate');
  const safetyLogs = systemLogs.filter((log) => isSafetyLog(log.message));

  const filteredRuntimeLogs = selectedProcessLogId === 'all'
    ? runtimeLogs
    : runtimeLogs.filter(log => log.tabName.toLowerCase() === selectedProcessLogId.toLowerCase());

  const formatTimestamp = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />;
      case 'error':
        return <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />;
      case 'warning':
        return <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
      default:
        return <Activity className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />;
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

  return (
    <div className="flex flex-col h-full bg-[#0B0F14] text-[#E5E7EB] font-sans p-4 space-y-4 overflow-y-auto border border-[#1F2937] rounded">
      
      {/* Workspace Agents Panel */}
      <div className="space-y-3 shrink-0">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-gray-400 tracking-wider">
            <Brain className="w-4 h-4 text-blue-500" />
            <span>Workspace Agents</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTopologyWizardOpen(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white rounded text-xs px-2.5 py-1 transition-all font-semibold shadow-md active:scale-95 border border-blue-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Suggest Agents</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddAgentOpen(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs px-2.5 py-1 transition-all font-semibold shadow-md active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Agent</span>
            </button>
          </div>
        </div>

        {(!activeWorkspace?.agents || activeWorkspace.agents.length === 0) ? (
          <div className="p-6 text-center text-xs text-gray-500 border border-dashed border-gray-800 rounded bg-[#111827]/10 font-mono">
            No agents assigned to this workspace. Click "Add Agent" to define a worker.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {activeWorkspace.agents.map((agent) => {
              const session = agentSessions.find(s => s.agentId === agent.id && s.workspaceId === activeWorkspace.id);
              const isActive = agent.status === 'active' || !!session;

              return (
                <div 
                  key={agent.id} 
                  className={`p-3 bg-[#111827]/40 border rounded flex flex-col justify-between space-y-3 transition-all ${
                    isActive 
                      ? 'border-blue-500/50 shadow-md shadow-blue-500/5 bg-[#111827]/60' 
                      : 'border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-200 text-xs flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>{agent.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        isActive
                          ? 'bg-green-950 text-green-400 border border-green-900/40 animate-pulse'
                          : 'bg-gray-950 text-gray-500 border border-gray-900'
                      }`}>
                        {isActive ? 'ACTIVE' : 'IDLE'}
                      </span>
                    </div>

                    <div className="text-[10px] text-gray-400 font-mono leading-relaxed line-clamp-2">
                      <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider block">Role</span>
                      {agent.role}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-900/40 font-mono text-[9px]">
                      <div>
                        <span className="text-gray-600 block uppercase tracking-wider">Model Binding</span>
                        <span className="text-blue-400 font-medium truncate block" title={agent.modelBinding.model}>
                          {agent.modelBinding.provider.toUpperCase()}: {agent.modelBinding.model}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 block uppercase tracking-wider">Available Tools</span>
                        <span className="text-gray-400 truncate block" title={agent.tools.join(', ')}>
                          {agent.tools.join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-900/40 shrink-0 font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => removeAgent(agent.id)}
                      className="text-gray-500 hover:text-red-400 p-1 transition-colors flex items-center gap-1"
                      title="Remove Agent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>

                    {isActive && session ? (
                      <button
                        type="button"
                        onClick={() => stopAgentSession(session.id)}
                        className="bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/40 px-2 py-1 rounded transition-colors flex items-center gap-1 font-bold active:scale-95"
                      >
                        <Square className="w-3.5 h-3.5 fill-red-400/25" />
                        <span>STOP SESSION</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startAgentSession(agent.id)}
                        className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2.5 py-1 rounded transition-colors flex items-center gap-1 font-bold active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-blue-400/25" />
                        <span>START SESSION</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1. Telemetry Dashboard Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
        
        {/* Active Services */}
        <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded font-mono text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-gray-500 font-bold uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span>Active Services</span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-2xl font-bold text-blue-400">{runningServicesCount}</span>
            <span className="text-[10px] text-gray-500">of {activeWorkspace?.services?.length || 0} configured</span>
          </div>
        </div>

        {/* Ollama API check */}
        <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded font-mono text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-gray-500 font-bold uppercase tracking-wider">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <span>Ollama GPU Service</span>
            </div>
            <button onClick={checkOllama} className="text-gray-600 hover:text-gray-400">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className={`text-sm font-bold ${ollamaStatus.running ? 'text-green-400' : 'text-red-400'}`}>
              {ollamaStatus.running ? 'ONLINE' : 'OFFLINE'}
            </span>
            <span className="text-[10px] text-gray-500">
              {ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? 's' : ''} loaded
            </span>
          </div>
        </div>

        {/* Active Workspace Probes */}
        <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded font-mono text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-gray-500 font-bold uppercase tracking-wider">
              <Activity className="w-4 h-4 text-green-400" />
              <span>Active Target Probe</span>
            </div>
            <button onClick={pollPortsHealth} className="text-gray-600 hover:text-gray-400">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className={`text-sm font-bold ${activeWorkspaceObs.apiOnline ? 'text-green-400' : 'text-gray-500'}`}>
              {activeWorkspaceObs.apiOnline ? 'HEALTHY' : 'STANDBY'}
            </span>
            <span className="text-[10px] text-gray-500">
              port: {activeWorkspaceObs.port || '80'}
            </span>
          </div>
        </div>

        {/* Memory Diagnostic (Explicitly N/A in Frontend) */}
        <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded font-mono text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-gray-500 font-bold uppercase tracking-wider">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Memory Diagnostic</span>
          </div>
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-2xl font-bold text-gray-500">N/A</span>
            <span className="text-[10px] text-gray-600 font-sans uppercase">Awaiting OS Probe</span>
          </div>
        </div>

      </div>

      {/* 2. Target Ports Status Indicators Grid */}
      <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0 font-mono text-xs">
        <span className="text-gray-500 uppercase font-bold tracking-wider">Workspace Port Watchdog:</span>
        <div className="flex gap-2 w-full sm:w-auto">
          {[
            { port: 3000, label: 'Sound Machina', online: isPort3000Online },
            { port: 8000, label: 'TM4 Governance', online: isPort8000Online },
            { port: 5173, label: 'RobotStore Dev', online: isPort5173Online }
          ].map((watch) => (
            <div 
              key={watch.port}
              className={`flex-1 sm:flex-initial px-3 py-1 rounded border flex items-center justify-between sm:justify-start gap-2 ${
                watch.online 
                  ? 'bg-green-950/20 text-green-400 border-green-900/40 font-bold' 
                  : 'bg-gray-950/40 text-gray-600 border-gray-900'
              }`}
            >
              <span>{watch.port}</span>
              <span className="text-[9px] uppercase tracking-wider text-gray-500 font-sans font-normal">({watch.label})</span>
              <span>{watch.online ? '✓' : '×'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Managed Services Workspace Grid */}
      <div className="space-y-2 shrink-0">
        <h3 className="text-xs font-bold uppercase text-gray-500 font-mono tracking-wider">Managed Services Processes</h3>
        
        {(!activeWorkspace?.services || activeWorkspace.services.length === 0) ? (
          <div className="p-6 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
            No v2 services configured in the active manifest. Use the editor to add services.
          </div>
        ) : (
          <div className="border border-gray-800 rounded overflow-hidden">
            <table className="w-full text-left font-mono text-xs bg-[#111827]/25 border-collapse">
              <thead>
                <tr className="bg-[#111827] border-b border-gray-850 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                  <th className="p-3">Service</th>
                  <th className="p-3">Command</th>
                  <th className="p-3">PID</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Started At</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {activeWorkspace.services.map((service) => {
                  const runningProc = managedProcesses.find(
                    (p) => p.commandId === service.id && p.workspaceId === activeWorkspace.id
                  );
                  const isRunning = runningProc && (runningProc.status === 'running' || runningProc.status === 'starting');

                  return (
                    <tr key={service.id} className="hover:bg-gray-950/40 transition-colors">
                      <td className="p-3 font-bold text-gray-300">
                        {service.label}
                      </td>
                      <td className="p-3 text-gray-400 text-[11px] truncate max-w-[200px]" title={service.command}>
                        <code>{service.command}</code>
                      </td>
                      <td className="p-3 text-blue-400">
                        {isRunning && runningProc ? runningProc.pid : '---'}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${
                          isRunning
                            ? 'bg-green-950 text-green-400 border border-green-900/40'
                            : 'bg-gray-950 text-gray-600 border border-gray-900'
                        }`}>
                          {isRunning ? 'RUNNING' : 'STOPPED'}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500 text-[11px]">
                        {isRunning && runningProc ? new Date(runningProc.startedAt).toLocaleTimeString() : '---'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {isRunning && runningProc ? (
                            <>
                              <button
                                onClick={() => restartManagedProcess(runningProc.id)}
                                className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-900/40 p-1.5 rounded transition-colors"
                                title="Restart Service"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => stopManagedProcess(runningProc.id)}
                                className="bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/40 p-1.5 rounded transition-colors"
                                title="Stop Service"
                              >
                                <Square className="w-3.5 h-3.5 fill-red-400/20" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startManagedProcess(service)}
                              className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2 py-1 rounded transition-colors flex items-center gap-1 font-bold"
                              title="Start Service"
                            >
                              <Play className="w-3.5 h-3.5 fill-blue-400/20" />
                              <span>START</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Logs Cockpit: Safety logs on left, live Console stream logs on right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[300px]">
        
        {/* Safety Audit logs */}
        <div className="flex flex-col bg-[#111827]/20 border border-gray-800 rounded overflow-hidden">
          <div className="bg-[#111827] border-b border-gray-850 px-3 py-2 flex justify-between items-center shrink-0">
            <span className="font-mono text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span>Safety Audit Logs ({safetyLogs.length})</span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1.5 bg-[#0B0F14]/20">
            {safetyLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-600 italic">
                No safety check violations or security blocks recorded.
              </div>
            ) : (
              safetyLogs.map((log, idx) => (
                <div 
                  key={log.timestamp || idx} 
                  className="p-2 rounded border border-red-950/20 bg-red-950/5 flex items-start gap-2.5"
                >
                  {getLogIcon(log.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`${getLogColorClass(log.type)} font-semibold leading-relaxed`}>
                        {log.message}
                      </span>
                      <span className="text-[9px] text-gray-600 shrink-0 mt-0.5">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Runtime Live Console logs stream */}
        <div className="flex flex-col bg-[#111827]/20 border border-gray-800 rounded overflow-hidden">
          <div className="bg-[#111827] border-b border-gray-850 px-3 py-2 flex justify-between items-center shrink-0">
            <span className="font-mono text-xs font-bold text-blue-400 flex items-center gap-1.5 uppercase">
              <Terminal className="w-4 h-4 text-blue-400" />
              <span>Live Processes Logs</span>
            </span>
            
            {/* Filter by process */}
            <div className="flex items-center gap-1 text-[10px] font-mono">
              <span className="text-gray-500">Filter:</span>
              <select
                value={selectedProcessLogId}
                onChange={(e) => setSelectedProcessLogId(e.target.value)}
                className="bg-[#0B0F14] border border-gray-800 focus:outline-none text-[10px] px-2 py-0.5 rounded text-blue-400"
              >
                <option value="all">ALL STREAMS</option>
                {activeWorkspace?.services?.map(s => (
                  <option key={s.id} value={s.label}>{s.label.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1.5 bg-[#0B0F14]/20 select-text">
            {filteredRuntimeLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-600 italic">
                No runtime logs output stream recorded.
              </div>
            ) : (
              filteredRuntimeLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  className="p-1 px-2 rounded border border-transparent flex items-start gap-2.5 hover:bg-[#111827]/40 text-gray-300"
                >
                  <span className="text-[9.5px] bg-[#1E293B] text-blue-300 border border-blue-900/50 px-1 py-0.2 rounded font-bold uppercase shrink-0 font-sans mt-0.5">
                    {log.tabName}
                  </span>
                  <span className="flex-1 break-all select-text font-mono text-[11px] leading-relaxed">
                    {log.message}
                  </span>
                  <span className="text-[9px] text-gray-600 shrink-0 font-sans mt-0.5">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      {/* Add Agent Modal */}
      {isAddAgentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm select-none font-sans">
          <div className="bg-[#111827] border border-[#1F2937] w-full max-w-md rounded-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937] bg-[#0d131f]/60 font-mono">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-gray-200 text-sm uppercase tracking-wide">
                  Assign Agent Worker
                </h3>
              </div>
              <button 
                onClick={() => setIsAddAgentOpen(false)} 
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateAgent} className="p-5 space-y-4 font-mono text-xs">
              {formError && (
                <div className="p-2.5 rounded bg-red-950/20 border border-red-900/40 text-red-400 font-mono flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-3 py-2 text-gray-300 rounded font-medium transition-colors"
                    placeholder="e.g. Test Runner Agent"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                    Role & Responsibilities
                  </label>
                  <input
                    type="text"
                    value={agentRole}
                    onChange={(e) => setAgentRole(e.target.value)}
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-3 py-2 text-gray-300 rounded font-medium transition-colors"
                    placeholder="e.g. Run tests and report diagnostics"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                      Model Provider
                    </label>
                    <select
                      value={modelProvider}
                      onChange={(e) => setModelProvider(e.target.value)}
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-3 py-2 text-gray-300 rounded transition-colors"
                    >
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="ollama">Ollama (Local)</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                      Model Name
                    </label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-3 py-2 text-gray-300 rounded transition-colors"
                      placeholder="e.g. gemini-1.5-pro"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1.5">
                    Available Tools
                  </label>
                  <div className="grid grid-cols-3 gap-2 bg-[#0B0F14]/50 border border-gray-850 p-2.5 rounded font-sans">
                    {(['terminal', 'browser', 'files', 'git', 'logs'] as const).map((tool) => {
                      const isChecked = selectedTools.includes(tool);
                      return (
                        <label 
                          key={tool} 
                          className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-300 hover:text-white"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTools([...selectedTools, tool]);
                              } else {
                                setSelectedTools(selectedTools.filter(t => t !== tool));
                              }
                            }}
                            className="rounded bg-[#0B0F14] border-gray-800 text-blue-600 focus:ring-blue-500/20"
                          />
                          <span className="capitalize">{tool}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F2937]">
                <button
                  type="button"
                  onClick={() => setIsAddAgentOpen(false)}
                  className="px-4 py-2 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/30 text-gray-400 hover:text-gray-200 rounded text-xs transition-colors font-medium font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-all font-semibold flex items-center gap-1 shadow-lg shadow-blue-500/10 active:scale-95 font-mono"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Assign Agent</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AgentTopologyWizard
        isOpen={isTopologyWizardOpen}
        onClose={() => setIsTopologyWizardOpen(false)}
      />

      </div>

    </div>
  );
};
export default RuntimeDashboardView;
