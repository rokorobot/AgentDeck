import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  Play, 
  FolderOpen
} from 'lucide-react';
import { AgentTopologySuggestion, SuggestedAgent, AgentTool, Agent } from '../types/agent';

interface AgentTopologyWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentTopologyWizard: React.FC<AgentTopologyWizardProps> = ({ isOpen, onClose }) => {
  const { activeWorkspace, saveActiveWorkspace, addSystemLog } = useWorkspaceStore();

  const [isScanning, setIsScanning] = useState(false);
  const [suggestion, setSuggestion] = useState<AgentTopologySuggestion | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [editedAgents, setEditedAgents] = useState<Record<string, SuggestedAgent>>({});
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentAgents = activeWorkspace?.agents || [];
  const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, ' ');
  const existingNames = currentAgents.map(a => normalizeName(a.name));

  const checkIfAgentExists = (name: string) => {
    return existingNames.includes(normalizeName(name));
  };

  const allExist = suggestion
    ? suggestion.suggestedAgents.every(sa => checkIfAgentExists(sa.name))
    : false;

  // Form states for inline editing
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editTools, setEditTools] = useState<AgentTool[]>([]);

  useEffect(() => {
    if (isOpen && activeWorkspace?.rootPath) {
      triggerScan();
    }
  }, [isOpen, activeWorkspace]);

  if (!isOpen) return null;

  const triggerScan = async () => {
    if (!activeWorkspace?.rootPath) return;
    setIsScanning(true);
    setError(null);
    setSuggestion(null);
    setEditedAgents({});
    setEditingAgentId(null);

    try {
      // Call Electron IPC or browser fallback
      const scanResult: AgentTopologySuggestion = await (window as any).api.workspaces.scanAgentTopology(
        activeWorkspace.rootPath
      );
      setSuggestion(scanResult);
      
      const nonDuplicateIds = scanResult.suggestedAgents
        .filter(sa => !existingNames.includes(normalizeName(sa.name)))
        .map(sa => sa.id);
      setSelectedAgentIds(nonDuplicateIds);
      
      // Initialize edited agents map
      const initialEdits: Record<string, SuggestedAgent> = {};
      scanResult.suggestedAgents.forEach(a => {
        initialEdits[a.id] = { ...a };
      });
      setEditedAgents(initialEdits);
    } catch (err: any) {
      console.error('Scan failed:', err);
      setError(err.message || 'Failed to scan workspace directory.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleStartEdit = (agentId: string) => {
    const target = editedAgents[agentId];
    if (!target) return;
    setEditingAgentId(agentId);
    setEditName(target.name);
    setEditRole(target.role);
    setEditProvider(target.modelBinding.provider);
    setEditModel(target.modelBinding.model);
    setEditTools([...target.tools]);
  };

  const handleSaveEdit = (agentId: string) => {
    if (!editName.trim()) return;
    if (!editRole.trim()) return;
    if (!editModel.trim()) return;

    setEditedAgents(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        name: editName,
        role: editRole,
        modelBinding: {
          provider: editProvider,
          model: editModel
        },
        tools: editTools
      }
    }));
    setEditingAgentId(null);
  };

  const handleToggleTool = (tool: AgentTool) => {
    if (editTools.includes(tool)) {
      setEditTools(prev => prev.filter(t => t !== tool));
    } else {
      setEditTools(prev => [...prev, tool]);
    }
  };

  const handleToggleSelect = (agentId: string) => {
    if (selectedAgentIds.includes(agentId)) {
      setSelectedAgentIds(prev => prev.filter(id => id !== agentId));
    } else {
      setSelectedAgentIds(prev => [...prev, agentId]);
    }
  };

  const handleAccept = async () => {
    if (!activeWorkspace || !suggestion) return;

    // Get current agents for duplicate prevention
    const currentAgents = activeWorkspace.agents || [];
    
    // Normalize agent names to prevent duplication
    const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, ' ');

    const newAgentsList: Agent[] = [...currentAgents];
    let addedCount = 0;

    selectedAgentIds.forEach(id => {
      const agentToCreate = editedAgents[id];
      if (!agentToCreate) return;

      const normSuggestedName = normalizeName(agentToCreate.name);
      const isDuplicate = currentAgents.some(
        existing => normalizeName(existing.name) === normSuggestedName && existing.workspaceId === activeWorkspace.id
      );

      if (!isDuplicate) {
        const newAgent: Agent = {
          id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          workspaceId: activeWorkspace.id,
          name: agentToCreate.name,
          role: agentToCreate.role,
          status: 'idle',
          modelBinding: {
            provider: agentToCreate.modelBinding.provider,
            model: agentToCreate.modelBinding.model
          },
          tools: agentToCreate.tools,
          createdAt: new Date().toISOString()
        };
        newAgentsList.push(newAgent);
        addedCount++;
      } else {
        addSystemLog(`Agent "${agentToCreate.name}" already exists in workspace. Skipping.`, 'warning');
      }
    });

    if (addedCount > 0) {
      const updatedWorkspace = {
        ...activeWorkspace,
        agents: newAgentsList
      };

      const res = await saveActiveWorkspace(updatedWorkspace);
      if (res.success) {
        await addSystemLog(`Wizard created ${addedCount} agent(s) in workspace configuration.`, 'success');
      }
    } else {
      await addSystemLog('No new agents were created (either unselected or duplicates).', 'info');
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none font-sans">
      <div className="bg-[#111827] border border-[#1F2937] w-full max-w-2xl rounded-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937] bg-[#0d131f]/60 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500 animate-pulse" />
            <h3 className="font-semibold text-gray-200 text-sm uppercase tracking-wide">
              Agent Topology Wizard
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          
          <div className="text-xs text-gray-400 font-mono bg-gray-900/50 p-2.5 rounded border border-gray-800 break-all flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <span className="text-gray-600 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Scanning Workspace Path</span>
              {activeWorkspace?.rootPath}
            </div>
          </div>

          {isScanning && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-gray-400 font-mono">Analyzing codebase structural topology...</p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs font-mono flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!isScanning && suggestion && (
            <div className="space-y-4">
              
              {/* Detections List */}
              <div className="p-3 bg-gray-900/45 border border-gray-800 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider">Detected Structure</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                    suggestion.confidence === 'high' 
                      ? 'bg-green-950/40 text-green-400 border border-green-900/30'
                      : suggestion.confidence === 'medium'
                      ? 'bg-amber-950/40 text-amber-400 border border-amber-900/30'
                      : 'bg-gray-950 text-gray-500 border border-gray-900'
                  }`}>
                    {suggestion.confidence} confidence
                  </span>
                </div>
                {suggestion.detectedFrom.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No specific workspace patterns detected. Suggesting default workspace outline.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {suggestion.detectedFrom.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center gap-1 bg-[#1F2937]/50 text-gray-300 px-2 py-1 rounded text-xs border border-gray-800 font-medium"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agent Recommendations Checklist */}
              <div className="space-y-2.5">
                <span className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider">Suggested Agent Topology</span>
                
                {allExist && (
                  <div className="p-3.5 rounded border border-green-900/30 bg-green-950/15 text-green-400 text-xs font-mono flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block uppercase tracking-wider text-[10px] mb-0.5">Recommendations Synced</span>
                      All recommended agents already exist in this workspace.
                    </div>
                  </div>
                )}
                
                {suggestion.suggestedAgents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500 border border-dashed border-gray-800 rounded bg-[#111827]/10 font-mono">
                    No custom topology suggestions. Assign agents manually.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {suggestion.suggestedAgents.map(sa => {
                      const isSelected = selectedAgentIds.includes(sa.id);
                      const isEditing = editingAgentId === sa.id;
                      const agentData = editedAgents[sa.id] || sa;
                      const exists = checkIfAgentExists(agentData.name);

                      return (
                        <div 
                          key={sa.id}
                          className={`border rounded-lg overflow-hidden transition-all ${
                            exists
                              ? 'border-gray-800 bg-[#0B0F14]/20 opacity-55'
                              : isSelected 
                              ? 'border-blue-900/60 bg-[#111827]/60' 
                              : 'border-gray-850 bg-[#0B0F14]/30 opacity-70'
                          }`}
                        >
                          {/* Card Header & Display */}
                          <div className="p-3.5 flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              {exists ? (
                                <div className="w-4 h-4 mt-1 rounded-full bg-green-950/50 border border-green-900/40 flex items-center justify-center text-green-400 font-bold text-[9px] shrink-0" title="Already exists">
                                  ✓
                                </div>
                              ) : (
                                <input 
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelect(sa.id)}
                                  className="w-4 h-4 mt-1 rounded border-gray-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              )}
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-gray-200 text-sm">{agentData.name}</span>
                                  <span className="text-[10px] text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded font-mono">
                                    {agentData.modelBinding.provider.toUpperCase()}: {agentData.modelBinding.model}
                                  </span>
                                  {exists && (
                                    <span className="text-[9px] text-green-400 bg-green-950/30 px-1.5 py-0.5 border border-green-900/30 rounded font-mono uppercase tracking-wider font-semibold">
                                      Already configured
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 leading-relaxed font-sans">{agentData.role}</p>
                                <div className="text-[10px] text-blue-500/80 font-mono pt-1">
                                  <span className="text-gray-600 uppercase font-bold">Reason:</span> {sa.reason}
                                </div>
                                <div className="flex gap-1.5 pt-1.5">
                                  {agentData.tools.map(tool => (
                                    <span key={tool} className="px-1.5 py-0.5 rounded bg-gray-900 text-gray-500 border border-gray-850 font-mono text-[9px] uppercase">
                                      {tool}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            {!isEditing && !exists && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(sa.id)}
                                className="text-gray-500 hover:text-blue-400 p-1 rounded hover:bg-gray-800/40 transition-all font-mono text-xs flex items-center gap-1 shrink-0"
                              >
                                <Sliders className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                            )}
                          </div>

                          {/* Inline Edit Form */}
                          {isEditing && (
                            <div className="bg-gray-900/60 border-t border-gray-850 p-4 space-y-3 font-mono text-xs">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-1">Agent Name</label>
                                  <input 
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2.5 py-1.5 text-gray-300 rounded font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-1">Model Config</label>
                                  <div className="flex gap-1.5">
                                    <select
                                      value={editProvider}
                                      onChange={e => setEditProvider(e.target.value)}
                                      className="bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-1.5 py-1.5 text-gray-300 rounded uppercase text-[10px]"
                                    >
                                      <option value="openai">OpenAI</option>
                                      <option value="anthropic">Anthropic</option>
                                      <option value="gemini">Gemini</option>
                                      <option value="ollama">Ollama</option>
                                    </select>
                                    <input 
                                      type="text"
                                      value={editModel}
                                      onChange={e => setEditModel(e.target.value)}
                                      className="flex-1 bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2.5 py-1.5 text-gray-300 rounded"
                                      placeholder="Model name"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-1">Role Description</label>
                                <textarea 
                                  value={editRole}
                                  onChange={e => setEditRole(e.target.value)}
                                  rows={2}
                                  className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2.5 py-1.5 text-gray-300 rounded font-sans leading-relaxed"
                                />
                              </div>

                              <div>
                                <label className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-1.5">Tools Allowed</label>
                                <div className="flex gap-2">
                                  {(['terminal', 'browser', 'files', 'git', 'logs'] as AgentTool[]).map(t => {
                                    const hasTool = editTools.includes(t);
                                    return (
                                      <button
                                        key={t}
                                        type="button"
                                        onClick={() => handleToggleTool(t)}
                                        className={`px-2 py-1 rounded border text-[10px] uppercase font-bold transition-all ${
                                          hasTool
                                            ? 'bg-blue-950/20 text-blue-400 border-blue-500/50'
                                            : 'bg-[#0B0F14] text-gray-600 border-gray-850 hover:border-gray-800'
                                        }`}
                                      >
                                        {t}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingAgentId(null)}
                                  className="px-3 py-1.5 border border-gray-800 hover:border-gray-700 text-gray-500 hover:text-gray-300 rounded text-[11px]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(sa.id)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold"
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1F2937] bg-[#0d131f]/20 shrink-0 font-mono text-xs">
          
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-850 hover:border-gray-750 text-gray-400 hover:text-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-red-950/30 hover:bg-red-950/50 text-red-400 hover:text-red-300 border border-red-900/30 rounded transition-colors"
            >
              Reject Suggestions
            </button>
            <button
              type="button"
              disabled={isScanning || !suggestion || selectedAgentIds.length === 0}
              onClick={handleAccept}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded font-semibold flex items-center gap-1.5 transition-all shadow-lg active:scale-98"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Accept Selected</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
