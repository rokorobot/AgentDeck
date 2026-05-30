import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useWorkspaceStore } from '../store/workspaceStore';
import { checkCommandSafety } from '../lib/commandSafety';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  terminalId: string;
  isActive: boolean;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ terminalId, isActive }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { addSystemLog } = useWorkspaceStore();

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize xterm.js Terminal
    const term = new Terminal({
      theme: {
        background: '#0B0F14',
        foreground: '#E5E7EB',
        cursor: '#3B82F6',
        cursorAccent: '#0B0F14',
        black: '#1F2937',
        red: '#EF4444',
        green: '#22C55E',
        yellow: '#F59E0B',
        blue: '#3B82F6',
        magenta: '#D946EF',
        cyan: '#06B6D4',
        white: '#F3F4F6',
        brightBlack: '#4B5563',
        brightRed: '#F87171',
        brightGreen: '#4ADE80',
        brightYellow: '#FBBF24',
        brightBlue: '#60A5FA',
        brightMagenta: '#E879F9',
        brightCyan: '#22D3EE',
        brightWhite: '#FFFFFF',
      },
      fontFamily: 'JetBrains Mono, Fira Code, Courier New, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    
    // Auto-fit immediately
    try {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        window.api.terminal.resize(terminalId, dims.cols, dims.rows);
      }
    } catch (e) {
      console.warn('Initial terminal fit failed:', e);
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect stdin -> backend write with frontend command interception safety check
    let lineBuffer = '';
    const onKeyDispose = term.onData((data) => {
      // Handle pasted commands (multi-character input)
      if (data.length > 1) {
        const workspacePath = useWorkspaceStore.getState().activeWorkspace?.rootPath || 'E:\\AgentDeck';
        const safetyCheck = checkCommandSafety(data, workspacePath);
        
        if (!safetyCheck.safe) {
          useWorkspaceStore.getState().setSafetyDialog({
            open: true,
            command: data,
            terminalId,
            reason: safetyCheck.reason || '',
            onConfirm: async () => {
              await window.api.safety.approveCommand(data);
              window.api.terminal.write(terminalId, data);
            },
            onCancel: () => {
              window.api.terminal.write(terminalId, '\x03');
            }
          });
          return;
        }
        
        lineBuffer += data;
        if (data.includes('\r') || data.includes('\n')) {
          lineBuffer = '';
        }
        window.api.terminal.write(terminalId, data);
        return;
      }

      // Handle interactive carriage returns
      if (data === '\r' || data === '\n' || data === '\r\n') {
        const command = lineBuffer;
        lineBuffer = ''; // Reset local buffer
        
        const workspacePath = useWorkspaceStore.getState().activeWorkspace?.rootPath || 'E:\\AgentDeck';
        const safetyCheck = checkCommandSafety(command, workspacePath);
        
        if (!safetyCheck.safe) {
          useWorkspaceStore.getState().setSafetyDialog({
            open: true,
            command,
            terminalId,
            reason: safetyCheck.reason || '',
            onConfirm: async () => {
              await window.api.safety.approveCommand(command);
              window.api.terminal.write(terminalId, '\r');
            },
            onCancel: () => {
              window.api.terminal.write(terminalId, '\x03');
            }
          });
          return;
        }
        
        window.api.terminal.write(terminalId, data);
      } else if (data === '\x7f' || data === '\x08') {
        // Backspace
        if (lineBuffer.length > 0) {
          lineBuffer = lineBuffer.slice(0, -1);
        }
        window.api.terminal.write(terminalId, data);
      } else if (data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
        // Printable characters
        lineBuffer += data;
        window.api.terminal.write(terminalId, data);
      } else {
        // Control characters and inputs
        window.api.terminal.write(terminalId, data);
      }
    });

    // Connect backend output -> terminal print
    const offData = window.api.terminal.onData(terminalId, (data) => {
      term.write(data);
      useWorkspaceStore.getState().addRuntimeLog(terminalId, data);
    });

    // Handle session exit
    const offExit = window.api.terminal.onExit(terminalId, (code) => {
      term.write(`\r\n\x1b[31m[Console Exited with code ${code}. Press close tab to discard.]\x1b[0m\r\n`);
      addSystemLog(`Terminal session ${terminalId} exited with code ${code}`, 'warning');
    });

    // Handle process launch self-healing fallback recovery
    const offFallback = window.api.terminal.onFallbackRecreated(terminalId, () => {
      term.write(`\r\n\x1b[33m[ConPTY initialization error detected. Automatically recovered shell using spawn fallback mode.]\x1b[0m\r\n`);
      setTimeout(() => {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            window.api.terminal.resize(terminalId, dims.cols, dims.rows);
          }
        } catch {}
      }, 200);
    });

    // Handle resize observer to coordinate width changes
    const resizeObserver = new ResizeObserver(() => {
      if (!isActive) return;
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          window.api.terminal.resize(terminalId, dims.cols, dims.rows);
        }
      } catch (err) {
        // Ignore container dimensions conflicts during transitions
      }
    });
    
    resizeObserver.observe(containerRef.current);

    return () => {
      onKeyDispose.dispose();
      offData();
      offExit();
      offFallback();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [terminalId]);

  // Handle panel refitting when tab switching becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current && terminalRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          const dims = fitAddonRef.current?.proposeDimensions();
          if (dims) {
            window.api.terminal.resize(terminalId, dims.cols, dims.rows);
          }
          terminalRef.current?.focus();
        } catch (e) {
          console.warn('Terminal fit failed during activation:', e);
        }
      }, 50);
    }
  }, [isActive, terminalId]);

  return (
    <div className={`h-full w-full flex flex-col relative ${isActive ? 'block' : 'hidden'}`}>
      {/* Container holding xterm canvas element */}
      <div 
        ref={containerRef} 
        className="flex-1 bg-[#0B0F14] overflow-hidden w-full h-full"
      />
    </div>
  );
};
