import React, { useState, useEffect, useRef } from 'react';
import { 
  Globe, 
  RotateCw, 
  ExternalLink, 
  ShieldAlert,
  Sliders
} from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';

export const BrowserPreview: React.FC = () => {
  const { activeWorkspace } = useWorkspaceStore();
  const defaultUrl = activeWorkspace?.previewUrl || 'http://localhost:8000';
  
  const [urlInput, setUrlInput] = useState(defaultUrl);
  const [activeUrl, setActiveUrl] = useState(defaultUrl);
  const [isUrlSafe, setIsUrlSafe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Sync with active workspace change
  useEffect(() => {
    const wsUrl = activeWorkspace?.previewUrl || 'http://localhost:8000';
    setUrlInput(wsUrl);
    validateAndLoad(wsUrl);
  }, [activeWorkspace]);

  const validateAndLoad = (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    // Check if it is a local URL
    const isLocalhost = trimmed.startsWith('http://localhost') || 
                        trimmed.startsWith('https://localhost') ||
                        trimmed.startsWith('http://127.0.0.1') ||
                        trimmed.startsWith('https://127.0.0.1');

    if (!isLocalhost) {
      setIsUrlSafe(false);
      setErrorMsg('External browsing is disabled in v0.1. Only localhost or 127.0.0.1 addresses are allowed.');
      return;
    }

    setIsUrlSafe(true);
    setErrorMsg('');
    setActiveUrl(trimmed);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateAndLoad(urlInput);
  };

  const handleReload = () => {
    if (iframeRef.current && isUrlSafe) {
      iframeRef.current.src = activeUrl;
    }
  };

  const handleOpenExternal = () => {
    // Open standard browser using system commands (standard link trigger works in electron default, or we can use shell API if needed)
    // If electron is present, we can just open it, but standard anchor link with target="_blank" handles it
    const a = document.createElement('a');
    a.href = activeUrl;
    a.target = '_blank';
    a.click();
  };

  const loadPortPreset = (port: number) => {
    const localPreset = `http://localhost:${port}`;
    setUrlInput(localPreset);
    validateAndLoad(localPreset);
  };

  return (
    <div className="h-full flex flex-col bg-[#0B0F14] border border-[#1F2937] rounded overflow-hidden">
      
      {/* Top Address Bar layout */}
      <div className="bg-[#111827] border-b border-[#1F2937] px-3 py-2 flex items-center justify-between gap-3">
        <form onSubmit={handleSubmit} className="flex-1 flex items-center bg-[#0B0F14] border border-gray-800 rounded px-2.5 py-1">
          <Globe className="w-3.5 h-3.5 text-gray-500 mr-2 shrink-0" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="bg-transparent text-xs text-gray-300 w-full focus:outline-none font-mono"
            placeholder="http://localhost:3000"
          />
          <button type="submit" className="hidden" />
        </form>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReload}
            disabled={!isUrlSafe}
            className={`p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors ${!isUrlSafe ? 'opacity-40 cursor-not-allowed' : ''}`}
            title="Reload Preview"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title="Open in System Browser"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Port Preset Toolbar */}
      <div className="bg-[#111827]/40 border-b border-[#1F2937]/50 px-3 py-1 flex items-center gap-2">
        <Sliders className="w-3 h-3 text-gray-600" />
        <span className="text-[10px] text-gray-500 font-mono uppercase">Local Port Presets:</span>
        <div className="flex items-center gap-1">
          {[3000, 5173, 8000].map((port) => (
            <button
              key={port}
              onClick={() => loadPortPreset(port)}
              className="text-[10px] bg-gray-900 border border-gray-800 hover:border-blue-500/50 hover:text-blue-400 px-2 py-0.5 rounded text-gray-400 font-mono"
            >
              :{port}
            </button>
          ))}
        </div>
      </div>

      {/* Frame Visual content */}
      <div className="flex-1 relative bg-white">
        {isUrlSafe ? (
          <iframe
            ref={iframeRef}
            src={activeUrl}
            className="w-full h-full border-none bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="AgentDeck Visual Sandbox"
          />
        ) : (
          <div className="absolute inset-0 bg-[#0B0F14] flex flex-col items-center justify-center p-6 text-center">
            <ShieldAlert className="w-10 h-10 text-amber-500 mb-2 glow-amber rounded-full" />
            <h4 className="text-gray-200 font-semibold text-sm">Security Blocked Preview</h4>
            <p className="text-gray-500 text-xs mt-1 max-w-sm">
              {errorMsg}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
