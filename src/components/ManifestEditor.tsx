import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { validateManifest, ValidationError } from '../lib/manifestValidation';
import { Save, Plus, Trash2, Cpu, ShieldAlert, CheckCircle2, Lock } from 'lucide-react';
import { Workspace, WorkspaceService, WorkspaceQuickAction, TerminalPreset } from '../types/workspace';

export const ManifestEditor: React.FC = () => {
  const { activeWorkspace, saveActiveWorkspace } = useWorkspaceStore();

  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [services, setServices] = useState<WorkspaceService[]>([]);
  const [quickActions, setQuickActions] = useState<WorkspaceQuickAction[]>([]);
  const [terminals, setTerminals] = useState<TerminalPreset[]>([]);
  const [evalScript, setEvalScript] = useState('');
  const [evalThreshold, setEvalThreshold] = useState(0.7);

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveStatus, setSaveStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const isReadOnly = !activeWorkspace || !activeWorkspace.rootPath;

  // Sync with active workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name || '');
      setPreviewUrl(activeWorkspace.previewUrl || '');
      setServices(activeWorkspace.services || []);
      setQuickActions(activeWorkspace.quickActions || []);
      setTerminals(activeWorkspace.terminals || []);
      setEvalScript((activeWorkspace as any).evals?.script || '');
      setEvalThreshold((activeWorkspace as any).evals?.baselineThreshold || 0.7);
      setValidationErrors([]);
      setSaveStatus(null);
    }
  }, [activeWorkspace]);

  if (!activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 font-mono italic">
        Select a workspace to configure.
      </div>
    );
  }

  // --- Services handlers ---
  const handleAddService = () => {
    const newService: WorkspaceService = {
      id: `service-${crypto.randomUUID()}`,
      label: 'New Service',
      shell: 'powershell.exe',
      command: 'echo "Running service"',
      cwd: '.'
    };
    setServices([...services, newService]);
  };

  const handleUpdateService = (index: number, fields: Partial<WorkspaceService>) => {
    const updated = [...services];
    updated[index] = { ...updated[index], ...fields };
    setServices(updated);
  };

  const handleRemoveService = (index: number) => {
    setServices(services.filter((_, idx) => idx !== index));
  };

  // --- Quick Actions handlers ---
  const handleAddQuickAction = () => {
    const newAction: WorkspaceQuickAction = {
      id: `action-${crypto.randomUUID()}`,
      label: 'New Action',
      type: 'openFolder'
    };
    setQuickActions([...quickActions, newAction]);
  };

  const handleUpdateQuickAction = (index: number, fields: Partial<WorkspaceQuickAction>) => {
    const updated = [...quickActions];
    updated[index] = { ...updated[index], ...fields };
    setQuickActions(updated);
  };

  const handleRemoveQuickAction = (index: number) => {
    setQuickActions(quickActions.filter((_, idx) => idx !== index));
  };

  // --- Terminals presets handlers ---
  const handleAddTerminal = () => {
    const newTerm: TerminalPreset = {
      name: 'PowerShell Preset',
      shell: 'powershell.exe',
      cwd: activeWorkspace.rootPath || '.'
    };
    setTerminals([...terminals, newTerm]);
  };

  const handleUpdateTerminal = (index: number, fields: Partial<TerminalPreset>) => {
    const updated = [...terminals];
    updated[index] = { ...updated[index], ...fields };
    setTerminals(updated);
  };

  const handleRemoveTerminal = (index: number) => {
    setTerminals(terminals.filter((_, idx) => idx !== index));
  };

  // --- Validate & Save ---
  const handleSave = async () => {
    if (isReadOnly) return;
    setSaveStatus(null);

    const updatedConfig: Workspace = {
      schemaVersion: 'agentdeck.workspace.v2',
      id: activeWorkspace.id,
      name,
      rootPath: activeWorkspace.rootPath,
      previewUrl,
      health: {
        type: 'http',
        url: previewUrl
      },
      services,
      quickActions,
      terminals,
      evals: {
        script: evalScript.trim() || undefined,
        baselineThreshold: Number(evalThreshold) || 0.7
      }
    } as any;

    // Frontend validation
    const valResult = validateManifest(updatedConfig);
    if (!valResult.valid) {
      setValidationErrors(valResult.errors);
      setSaveStatus({ success: false, message: 'Schema validation checks failed. See errors below.' });
      return;
    }

    setValidationErrors([]);
    const saveRes = await saveActiveWorkspace(updatedConfig);
    if (saveRes.success) {
      setSaveStatus({ success: true, message: 'Configuration saved and backed up successfully!' });
    } else {
      setSaveStatus({ success: false, message: saveRes.error || 'Failed to save configuration.' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0B0F14] border border-[#1F2937] rounded overflow-hidden select-none font-sans">
      
      {/* Editor Header Panel */}
      <div className="bg-[#111827] border-b border-[#1F2937] px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-500 animate-pulse" />
          <h2 className="font-semibold text-gray-200 text-xs uppercase tracking-wider font-mono">
            Project Manifest Editor (.agentdeck/workspace.json)
          </h2>
        </div>
        
        <div className="flex items-center gap-3">
          {isReadOnly && (
            <div className="flex items-center gap-1 text-[10px] bg-red-950/20 text-red-400 border border-red-900/40 px-2 py-1 rounded font-mono">
              <Lock className="w-3.5 h-3.5 text-red-500" />
              <span>PRESET READ-ONLY</span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={isReadOnly}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isReadOnly
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-900'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/10 active:scale-98'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save & Backup</span>
          </button>
        </div>
      </div>

      {/* Main Form Scroller Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* Status Alerts Banners */}
        {saveStatus && (
          <div className={`p-3 rounded border font-mono text-xs flex items-start gap-2.5 ${
            saveStatus.success 
              ? 'bg-green-950/20 text-green-400 border-green-900/35' 
              : 'bg-red-950/20 text-red-400 border-red-900/35'
          }`}>
            {saveStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold">{saveStatus.success ? 'MANIFEST WRITE CONFIRMED' : 'MANIFEST WRITE BLOCKED'}</div>
              <div className="mt-0.5 text-gray-300 leading-relaxed">{saveStatus.message}</div>
            </div>
          </div>
        )}

        {/* Validation Errors List */}
        {validationErrors.length > 0 && (
          <div className="p-3 rounded border bg-red-950/10 border-red-900/25 font-mono text-xs space-y-1">
            <div className="text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Validation Errors Checklist ({validationErrors.length})</span>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 text-gray-400 mt-1 pl-1 border-l border-red-900/30">
              {validationErrors.map((err, idx) => (
                <div key={idx} className="flex gap-1.5 leading-snug">
                  <span className="text-red-500 font-bold">•</span>
                  <span>
                    <strong className="text-red-400/90">[{err.field}]</strong>: {err.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* LEFT COLUMN: General Settings & Terminals */}
          <div className="space-y-6">
            
            {/* General Settings */}
            <div className="bg-[#111827]/40 border border-gray-800 rounded p-4 space-y-4">
              <div className="text-[10px] text-gray-500 uppercase font-mono font-bold tracking-wider border-b border-gray-900 pb-1.5">
                General Configuration
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isReadOnly}
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-3 py-2 text-gray-300 rounded font-medium disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider mb-1">
                    Local Preview URL
                  </label>
                  <input
                    type="text"
                    value={previewUrl}
                    disabled={isReadOnly}
                    onChange={(e) => setPreviewUrl(e.target.value)}
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-3 py-2 text-gray-300 rounded font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider mb-1">
                    Evaluation Script (Optional)
                  </label>
                  <input
                    type="text"
                    value={evalScript}
                    disabled={isReadOnly}
                    onChange={(e) => setEvalScript(e.target.value)}
                    placeholder="e.g. npm run test:evals"
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-3 py-2 text-gray-300 rounded font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider mb-1">
                    Baseline Failure Threshold
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={evalThreshold}
                    disabled={isReadOnly}
                    onChange={(e) => setEvalThreshold(parseFloat(e.target.value) || 0.7)}
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-3 py-2 text-gray-300 rounded font-mono disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Terminals presets List */}
            <div className="bg-[#111827]/40 border border-gray-800 rounded p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-900 pb-1.5">
                <div className="text-[10px] text-gray-500 uppercase font-mono font-bold tracking-wider">
                  Interactive Terminals
                </div>
                {!isReadOnly && (
                  <button
                    onClick={handleAddTerminal}
                    className="text-blue-500 hover:text-blue-400 text-xs flex items-center gap-0.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Preset</span>
                  </button>
                )}
              </div>

              {terminals.length === 0 ? (
                <div className="text-xs text-gray-600 font-mono italic">
                  No terminal presets configured. At least one is required.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {terminals.map((term, index) => (
                    <div key={index} className="p-3 bg-[#0B0F14]/65 border border-gray-800 rounded space-y-2 relative group">
                      {!isReadOnly && (
                        <button
                          onClick={() => handleRemoveTerminal(index)}
                          className="absolute top-2.5 right-2.5 text-gray-600 hover:text-red-400 transition-colors p-1 hover:bg-red-950/20 rounded"
                          title="Remove terminal preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      
                      <div className="grid grid-cols-2 gap-3 max-w-[90%]">
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Preset Name</label>
                          <input
                            type="text"
                            value={term.name}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateTerminal(index, { name: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-medium disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Shell Executable</label>
                          <input
                            type="text"
                            value={term.shell}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateTerminal(index, { shell: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-mono disabled:opacity-50"
                            placeholder="powershell.exe"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Service Groups & Quick Actions */}
          <div className="space-y-6">

            {/* Service Groups */}
            <div className="bg-[#111827]/40 border border-gray-800 rounded p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-900 pb-1.5">
                <div className="text-[10px] text-gray-500 uppercase font-mono font-bold tracking-wider">
                  Service Groups (Orchestrated)
                </div>
                {!isReadOnly && (
                  <button
                    onClick={handleAddService}
                    className="text-blue-500 hover:text-blue-400 text-xs flex items-center gap-0.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Service</span>
                  </button>
                )}
              </div>

              {services.length === 0 ? (
                <div className="text-xs text-gray-600 font-mono italic">
                  No service groups configured. Click 'Add Service' to orchestrate multiple tools.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {services.map((service, index) => (
                    <div key={service.id} className="p-3 bg-[#0B0F14]/65 border border-gray-800 rounded space-y-2.5 relative">
                      {!isReadOnly && (
                        <button
                          onClick={() => handleRemoveService(index)}
                          className="absolute top-2.5 right-2.5 text-gray-600 hover:text-red-400 transition-colors p-1 hover:bg-red-950/20 rounded"
                          title="Remove service preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="grid grid-cols-3 gap-2.5 max-w-[90%]">
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Service ID</label>
                          <input
                            type="text"
                            value={service.id}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateService(index, { id: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-mono disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Visual Label</label>
                          <input
                            type="text"
                            value={service.label}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateService(index, { label: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-medium disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Shell Exec</label>
                          <input
                            type="text"
                            value={service.shell}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateService(index, { shell: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-mono disabled:opacity-50"
                            placeholder="powershell.exe"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Command Run script</label>
                        <input
                          type="text"
                          value={service.command}
                          disabled={isReadOnly}
                          onChange={(e) => handleUpdateService(index, { command: e.target.value })}
                          className="w-full bg-[#111827] border border-gray-850 text-xs px-2.5 py-1.5 text-gray-300 rounded font-mono disabled:opacity-50"
                          placeholder="e.g. npm run dev"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-[#111827]/40 border border-gray-800 rounded p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-900 pb-1.5">
                <div className="text-[10px] text-gray-500 uppercase font-mono font-bold tracking-wider">
                  Workspace Quick Actions
                </div>
                {!isReadOnly && (
                  <button
                    onClick={handleAddQuickAction}
                    className="text-blue-500 hover:text-blue-400 text-xs flex items-center gap-0.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Action</span>
                  </button>
                )}
              </div>

              {quickActions.length === 0 ? (
                <div className="text-xs text-gray-600 font-mono italic">
                  No quick actions configured. Click 'Add Action' to define sidebar visual tools.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {quickActions.map((action, index) => (
                    <div key={action.id} className="p-3 bg-[#0B0F14]/65 border border-gray-800 rounded space-y-2 relative">
                      {!isReadOnly && (
                        <button
                          onClick={() => handleRemoveQuickAction(index)}
                          className="absolute top-2.5 right-2.5 text-gray-600 hover:text-red-400 transition-colors p-1 hover:bg-red-950/20 rounded"
                          title="Remove action"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-3 max-w-[90%]">
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Action Label</label>
                          <input
                            type="text"
                            value={action.label}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateQuickAction(index, { label: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-medium disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Action Type</label>
                          <select
                            value={action.type}
                            disabled={isReadOnly}
                            onChange={(e: any) => handleUpdateQuickAction(index, { type: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-mono disabled:opacity-50"
                          >
                            <option value="openFolder">openFolder</option>
                            <option value="previewUrl">previewUrl</option>
                            <option value="command">command</option>
                            <option value="startService">startService</option>
                          </select>
                        </div>
                      </div>

                      {/* Type-based Action Input Values */}
                      {action.type === 'previewUrl' && (
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Redirect URL path</label>
                          <input
                            type="text"
                            value={action.url || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateQuickAction(index, { url: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1.5 text-gray-300 rounded font-mono disabled:opacity-50"
                            placeholder="http://localhost:3000/subpage"
                          />
                        </div>
                      )}
                      
                      {action.type === 'command' && (
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Terminal execute command</label>
                          <input
                            type="text"
                            value={action.command || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateQuickAction(index, { command: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1.5 text-gray-300 rounded font-mono disabled:opacity-50"
                            placeholder="e.g. python script.py"
                          />
                        </div>
                      )}

                      {action.type === 'startService' && (
                        <div>
                          <label className="block text-[9px] text-gray-600 font-mono uppercase mb-0.5">Target Service ID</label>
                          <select
                            value={action.serviceId || ''}
                            disabled={isReadOnly}
                            onChange={(e) => handleUpdateQuickAction(index, { serviceId: e.target.value })}
                            className="w-full bg-[#111827] border border-gray-850 text-xs px-2 py-1 text-gray-300 rounded font-mono disabled:opacity-50"
                          >
                            <option value="">-- Select Service --</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>{s.label} ({s.id})</option>
                            ))}
                          </select>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
