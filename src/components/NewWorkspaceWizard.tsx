import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { X, FolderOpen, Play, ShieldAlert, Cpu, Laptop } from 'lucide-react';

export const NewWorkspaceWizard: React.FC = () => {
  const { showWizard, wizardPath, initializeWorkspace, setWizardState } = useWorkspaceStore();

  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('http://localhost:3000');
  const [selectedTemplate, setSelectedTemplate] = useState('vite');
  const [error, setError] = useState('');

  useEffect(() => {
    if (wizardPath) {
      // Default name to the folder name
      const parts = wizardPath.split(/[\\/]/);
      const folderName = parts[parts.length - 1] || 'New Workspace';
      setName(folderName);
      setError('');
    }
  }, [wizardPath]);

  if (!showWizard || !wizardPath) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Workspace Name is required');
      return;
    }

    if (!previewUrl.trim()) {
      setError('Preview URL is required');
      return;
    }

    const isLocal = previewUrl.startsWith('http://localhost') || 
                    previewUrl.startsWith('https://localhost') ||
                    previewUrl.startsWith('http://127.0.0.1') ||
                    previewUrl.startsWith('https://127.0.0.1');

    if (!isLocal) {
      setError('Preview URL must be a local server address (localhost or 127.0.0.1)');
      return;
    }

    await initializeWorkspace(wizardPath, name, previewUrl, selectedTemplate);
  };

  const templates = [
    {
      id: 'vite',
      title: 'Node.js / React (Vite)',
      desc: 'Spawns npm run dev frontend service group automatically.',
      icon: <Cpu className="w-5 h-5 text-blue-400" />
    },
    {
      id: 'fastapi',
      title: 'Python (FastAPI / Uvicorn)',
      desc: 'Configures uvicorn main:app backend service preset.',
      icon: <Cpu className="w-5 h-5 text-emerald-400" />
    },
    {
      id: 'static',
      title: 'Static Web Server',
      desc: 'Launches serve helper on local root path files.',
      icon: <Laptop className="w-5 h-5 text-amber-400" />
    },
    {
      id: 'custom',
      title: 'Custom (Blank)',
      desc: 'Empty service array config. Add services manually.',
      icon: <FolderOpen className="w-5 h-5 text-gray-400" />
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm select-none font-sans">
      <div className="bg-[#111827] border border-[#1F2937] w-full max-w-lg rounded-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937] bg-[#0d131f]/60">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-gray-200 text-sm uppercase tracking-wide">
              Initialize Project Manifest
            </h3>
          </div>
          <button 
            onClick={() => setWizardState(false)} 
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          <div className="text-xs text-gray-400 font-mono bg-gray-900/50 p-2 rounded border border-gray-800 break-all leading-relaxed">
            <span className="text-gray-600 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Directory Path</span>
            {wizardPath}
          </div>

          {error && (
            <div className="p-2.5 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs font-mono flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider mb-1">
                Workspace Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-3 py-2 text-gray-300 rounded font-medium transition-colors"
                placeholder="e.g. My App"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider mb-1">
                Preview Local URL
              </label>
              <input
                type="text"
                value={previewUrl}
                onChange={(e) => setPreviewUrl(e.target.value)}
                className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none text-xs px-3 py-2 text-gray-300 rounded font-mono transition-colors"
                placeholder="http://localhost:3000"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider mb-2">
              Choose Workspace Template Preset
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {templates.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`p-3 rounded border cursor-pointer transition-all flex flex-col justify-between h-28 hover:bg-[#1f2937]/30 ${
                      isSelected
                        ? 'bg-blue-950/20 border-blue-500 shadow-md shadow-blue-500/5'
                        : 'bg-[#0B0F14] border-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {tpl.icon}
                      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-500 bg-blue-600' : 'border-gray-700'}`}>
                        {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs text-gray-200 font-semibold truncate">{tpl.title}</div>
                      <div className="text-[10px] text-gray-500 font-sans mt-0.5 line-clamp-2 leading-tight">
                        {tpl.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Buttons Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={() => setWizardState(false)}
              className="px-4 py-2 border border-gray-850 hover:border-gray-700 hover:bg-gray-850/30 text-gray-400 hover:text-gray-200 rounded text-xs transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-all font-semibold flex items-center gap-1 shadow-lg shadow-blue-500/10 active:scale-98"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Initialize Workspace</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
