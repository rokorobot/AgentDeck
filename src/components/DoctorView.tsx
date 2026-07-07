import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  HeartPulse, 
  RefreshCw, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  ShieldAlert, 
  Wrench,
  Clock
} from 'lucide-react';
import { DiagnosticCheck } from '../types/doctor';

export const DoctorView: React.FC = () => {
  const {
    activeWorkspace,
    doctorReport,
    runDoctorChecks,
    repairWorkspaceCheck,
    exportDiagnosticBundle
  } = useWorkspaceStore();

  const [isChecking, setIsChecking] = useState(false);
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (activeWorkspace) {
      handleRunChecks();
    }
  }, [activeWorkspace]);

  if (!activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 font-mono">
        No active workspace selected.
      </div>
    );
  }

  const handleRunChecks = async () => {
    setIsChecking(true);
    setStatusMessage({ text: 'Scanning workspace files and integrity checksums...', type: 'info' });
    try {
      await runDoctorChecks();
      setStatusMessage({ text: 'Workspace diagnostic scan complete.', type: 'success' });
    } catch (e: any) {
      setStatusMessage({ text: `Scan failed: ${e.message}`, type: 'error' });
    } finally {
      setIsChecking(false);
    }
  };

  const handleRepair = async (checkId: string) => {
    // Repair actions are stubbed out until step 6 is complete in backend,
    // but we hook it up to print status and execute store action.
    setRepairingId(checkId);
    setStatusMessage({ text: `Initiating repair sequence for check: ${checkId}...`, type: 'info' });
    try {
      const result = await repairWorkspaceCheck(checkId);
      if (result.success) {
        setStatusMessage({ text: `Successfully repaired: ${checkId}`, type: 'success' });
      } else {
        setStatusMessage({ text: `Repair failed: ${result.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: `Repair crashed: ${e.message}`, type: 'error' });
    } finally {
      setRepairingId(null);
    }
  };

  const handleExportBundle = async () => {
    setIsExporting(true);
    setStatusMessage({ text: 'Compiling diagnostic report and archiving configurations...', type: 'info' });
    try {
      const result = await exportDiagnosticBundle();
      if (result.success) {
        setStatusMessage({ text: 'Diagnostic bundle exported successfully.', type: 'success' });
      } else {
        setStatusMessage({ text: `Export failed: ${result.error || 'User cancelled or failed'}`, type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: `Export crashed: ${e.message}`, type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  // Get status color tokens
  const status = doctorReport?.status || 'healthy';
  const bannerColors = {
    healthy: {
      bg: 'bg-emerald-950/20 border-emerald-500/30',
      text: 'text-emerald-400',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.05)] border-emerald-500/20',
      icon: <CheckCircle className="w-8 h-8 text-emerald-400" />,
      title: 'System Healthy',
      desc: 'No corruption, missing folders, or integrity checksum mismatches detected. Workspace is operating in full trust mode.'
    },
    warning: {
      bg: 'bg-amber-950/20 border-amber-500/30',
      text: 'text-amber-400',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.05)] border-amber-500/20',
      icon: <AlertTriangle className="w-8 h-8 text-amber-400 animate-pulse" />,
      title: 'Inconsistencies Detected',
      desc: 'Minor issues found. Some legacy snapshots have no integrity checksum, or orphan references were discovered. Restores are safe, but review is recommended.'
    },
    critical: {
      bg: 'bg-red-950/20 border-red-500/30',
      text: 'text-red-400',
      glow: 'shadow-[0_0_15px_rgba(239,68,68,0.08)] border-red-500/20 animate-pulse',
      icon: <ShieldAlert className="w-8 h-8 text-red-500 animate-bounce" />,
      title: 'State Integrity Compromised',
      desc: 'Critical governance schema anomalies, malformed configuration files, or checksum mismatches detected. Review evidence logs immediately!'
    }
  }[status];

  return (
    <div className="h-full flex flex-col bg-[#0F172A] text-gray-100 overflow-hidden font-sans">
      {/* Header bar */}
      <div className="px-6 py-4 bg-[#1E293B]/40 border-b border-[#1F2937]/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <HeartPulse className={`w-5 h-5 ${status === 'critical' ? 'text-red-500 animate-pulse' : 'text-blue-400'}`} />
          <div>
            <h1 className="text-sm font-semibold tracking-wider uppercase text-gray-100">Workspace Doctor</h1>
            <p className="text-[10px] text-gray-500 font-mono">Scope: {activeWorkspace.name} ({activeWorkspace.id})</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportBundle}
            disabled={isExporting}
            className="px-3 py-1.5 bg-[#1F2937] hover:bg-gray-800 text-gray-300 text-xs font-mono rounded border border-gray-700/50 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>{isExporting ? 'Exporting...' : 'Export Diagnostics'}</span>
          </button>
          
          <button
            onClick={handleRunChecks}
            disabled={isChecking}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Scanning...' : 'Run Diagnostics'}</span>
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Overall Status Banner */}
        <div className={`p-5 rounded-lg border flex items-start gap-4 transition-all duration-300 ${bannerColors.bg} ${bannerColors.glow}`}>
          <div className="shrink-0 p-1.5 bg-gray-900/50 rounded-lg border border-gray-800/80">
            {bannerColors.icon}
          </div>
          <div className="space-y-1">
            <h2 className={`text-md font-bold tracking-wide uppercase ${bannerColors.text}`}>{bannerColors.title}</h2>
            <p className="text-xs text-gray-400 leading-relaxed font-sans">{bannerColors.desc}</p>
            {doctorReport?.timestamp && (
              <div className="text-[10px] text-gray-600 font-mono flex items-center gap-1.5 pt-1.5">
                <Clock className="w-3 h-3" />
                <span>Last Scan: {new Date(doctorReport.timestamp).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Live system logs / alerts overlay */}
        {statusMessage && (
          <div className={`px-4 py-2 text-xs font-mono rounded border ${
            statusMessage.type === 'error' ? 'bg-red-950/20 border-red-900/30 text-red-400' :
            statusMessage.type === 'success' ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400' :
            'bg-[#1e293b]/40 border-blue-900/30 text-blue-400'
          }`}>
            <span className="font-bold mr-2">&rsaquo;</span>
            {statusMessage.text}
          </div>
        )}

        {/* Diagnostic Checks Breakdown */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">Diagnostic Check Breakdown</h3>
          
          {!doctorReport ? (
            <div className="py-12 text-center text-xs text-gray-500 font-mono">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
              Initializing diagnostics engine...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {doctorReport.checks.map((check: DiagnosticCheck) => {
                const statusBadge = {
                  passed: (
                    <span className="px-2 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 rounded-full text-[10px] font-mono font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>PASSED</span>
                    </span>
                  ),
                  warning: (
                    <span className="px-2 py-0.5 bg-amber-950/40 text-amber-400 border border-amber-900/50 rounded-full text-[10px] font-mono font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>WARNING</span>
                    </span>
                  ),
                  failed: (
                    <span className="px-2 py-0.5 bg-red-950/40 text-red-400 border border-red-900/50 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 animate-pulse">
                      <XCircle className="w-3 h-3" />
                      <span>FAILED</span>
                    </span>
                  )
                }[check.status];

                return (
                  <div key={check.id} className="p-4 bg-[#1E293B]/20 hover:bg-[#1E293B]/30 border border-[#1F2937]/80 hover:border-gray-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all group">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-semibold text-gray-200 tracking-wide font-sans">{check.name}</span>
                        {statusBadge}
                      </div>
                      <p className="text-xs text-gray-400 font-sans leading-relaxed">{check.description}</p>
                      
                      {check.message && check.status !== 'passed' && (
                        <div className="mt-2 text-[10px] font-mono bg-black/30 border border-gray-800/40 rounded p-2 text-gray-300">
                          <span className="text-amber-500 font-bold mr-1.5">&gt;</span>
                          {check.message}
                          
                          {check.id === 'provenance-tamper' && check.details?.tamperedProvIds?.length > 0 && (
                            <div className="text-red-400 mt-1 pl-3 font-semibold font-mono">
                              * QUARANTINE REQUIRED (records with a checksum mismatch cannot be re-checksummed): {check.details.tamperedProvIds.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {check.status !== 'passed' && check.repairable && (
                      <div className="shrink-0 flex flex-col items-end gap-1.5 self-start md:self-center">
                        <button
                          onClick={() => handleRepair(check.id)}
                          disabled={repairingId !== null}
                          className="px-3 py-1.5 bg-[#1F2937] hover:bg-blue-950/30 text-gray-300 hover:text-blue-400 border border-gray-700/50 hover:border-blue-900/50 text-[10px] font-mono rounded flex items-center gap-1.5 transition-all w-full md:w-auto justify-center disabled:opacity-50"
                        >
                          <Wrench className={`w-3.5 h-3.5 text-blue-500 ${repairingId === check.id ? 'animate-spin' : ''}`} />
                          <span>{repairingId === check.id ? 'Repairing...' : 'Repair Check'}</span>
                        </button>
                        {check.repairSuggestion && (
                          <span className="text-[9px] text-gray-500 font-mono italic max-w-[180px] text-right hidden md:block">
                            ({check.repairSuggestion})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
