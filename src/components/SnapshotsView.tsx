import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  Camera, 
  Archive, 
  RefreshCw, 
  AlertTriangle, 
  RotateCcw,
  TrendingUp,
  Info
} from 'lucide-react';
import { SnapshotManifest } from '../types/snapshot';

export const SnapshotsView: React.FC = () => {
  const {
    activeWorkspace,
    snapshotsList,
    createSnapshot,
    restoreSnapshot,
    loadSnapshots,
    benchmarks,
    failures,
    goldStandards,
    judges,
    promotions,
    regressionRuns,
    governancePolicies,
    releaseCandidates,
    timelineEvents
  } = useWorkspaceStore();

  const [description, setDescription] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'manual' | 'auto-backup' | 'pre-restore'>('all');
  const [filterIntegrity, setFilterIntegrity] = useState<'all' | 'verified' | 'unsigned' | 'tampered'>('all');
  
  // Selection for comparison
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null); // 'live' or snapshot ID
  const [compareResult, setCompareResult] = useState<any | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Restore Modal State
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');

  useEffect(() => {
    loadSnapshots();
  }, [activeWorkspace]);

  if (!activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 font-mono">
        No active workspace selected.
      </div>
    );
  }

  const rootPath = activeWorkspace.rootPath || null;
  const presetId = activeWorkspace.id;

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    await createSnapshot(description, 'manual');
    setDescription('');
  };

  const handleRestore = async (snapshotId: string) => {
    setIsRestoring(true);
    setRestoreMessage('Creating pre-restore safety backup and executing recovery...');
    const result = await restoreSnapshot(snapshotId);
    setIsRestoring(false);
    setConfirmRestoreId(null);
    if (result.success) {
      alert(`Workspace successfully restored to ${snapshotId}.`);
    } else {
      alert(`Restoration failed: ${result.error}`);
    }
  };

  // Build live state payload to compare against snapshots
  const getLivePayload = () => {
    return {
      manifest: activeWorkspace,
      benchmarks,
      failures,
      goldStandards,
      judges,
      promotions,
      regressionRuns,
      policies: governancePolicies,
      releaseCandidates,
      timelineEvents
    };
  };

  const executeComparison = async () => {
    if (!compareLeftId) return;
    setIsComparing(true);

    try {
      // Load payloads
      const leftPayload = await window.api.snapshots.loadPayload(rootPath, presetId, compareLeftId);
      const rightPayload = compareRightId === 'live' 
        ? getLivePayload()
        : await window.api.snapshots.loadPayload(rootPath, presetId, compareRightId!);

      // Compute comparisons
      const leftDesc = snapshotsList.find(s => s.snapshotId === compareLeftId)?.description || compareLeftId;
      const rightDesc = compareRightId === 'live' 
        ? 'Live Operational State' 
        : snapshotsList.find(s => s.snapshotId === compareRightId)?.description || compareRightId;

      const delta = {
        leftTitle: leftDesc,
        rightTitle: rightDesc,
        benchmarks: {
          left: leftPayload.benchmarks?.length || 0,
          right: rightPayload.benchmarks?.length || 0,
          diff: (rightPayload.benchmarks?.length || 0) - (leftPayload.benchmarks?.length || 0)
        },
        failures: {
          left: leftPayload.failures?.length || 0,
          right: rightPayload.failures?.length || 0,
          diff: (rightPayload.failures?.length || 0) - (leftPayload.failures?.length || 0)
        },
        goldStandards: {
          left: leftPayload.goldStandards?.length || 0,
          right: rightPayload.goldStandards?.length || 0,
          diff: (rightPayload.goldStandards?.length || 0) - (leftPayload.goldStandards?.length || 0)
        },
        judges: {
          left: leftPayload.judges?.length || 0,
          right: rightPayload.judges?.length || 0,
          diff: (rightPayload.judges?.length || 0) - (leftPayload.judges?.length || 0)
        },
        timelineEvents: {
          left: leftPayload.timelineEvents?.length || 0,
          right: rightPayload.timelineEvents?.length || 0,
          diff: (rightPayload.timelineEvents?.length || 0) - (leftPayload.timelineEvents?.length || 0)
        },
        releaseCandidates: {
          left: leftPayload.releaseCandidates?.length || 0,
          right: rightPayload.releaseCandidates?.length || 0,
          diff: (rightPayload.releaseCandidates?.length || 0) - (leftPayload.releaseCandidates?.length || 0)
        },
        policies: {
          leftMinScore: leftPayload.policies?.minScore || 0.80,
          rightMinScore: rightPayload.policies?.minScore || 0.80,
          leftRequireApprove: leftPayload.policies?.requireApproval ? 'Enabled' : 'Disabled',
          rightRequireApprove: rightPayload.policies?.requireApproval ? 'Enabled' : 'Disabled',
          leftAllowRegress: leftPayload.policies?.allowRegression ? 'Enabled' : 'Disabled',
          rightAllowRegress: rightPayload.policies?.allowRegression ? 'Enabled' : 'Disabled'
        }
      };

      setCompareResult(delta);
    } catch (e) {
      console.error('Failed to compare snapshots:', e);
      alert('Error loading snapshot payloads for comparison.');
    } finally {
      setIsComparing(false);
    }
  };

  const clearComparison = () => {
    setCompareLeftId(null);
    setCompareRightId(null);
    setCompareResult(null);
  };

  // Filtered lists
  const filteredSnapshots = snapshotsList.filter(s => {
    const typeMatch = filterType === 'all' || s.type === filterType;
    const integrityMatch = filterIntegrity === 'all' || s.integrityStatus === filterIntegrity;
    return typeMatch && integrityMatch;
  });

  const getIntegrityBadge = (status: SnapshotManifest['integrityStatus']) => {
    switch (status) {
      case 'verified':
        return <span className="bg-green-950/40 text-green-400 border border-green-900/40 px-2 py-0.5 rounded text-[9px] font-bold">VERIFIED</span>;
      case 'unsigned':
        return <span className="bg-amber-950/40 text-amber-500 border border-amber-900/40 px-2 py-0.5 rounded text-[9px] font-bold">NO CHECKSUM / LEGACY</span>;
      case 'tampered':
        return <span className="bg-red-950/40 text-red-400 border border-red-900/40 px-2 py-0.5 rounded text-[9px] font-bold animate-pulse">CHECKSUM MISMATCH</span>;
    }
  };

  const getTypeBadge = (type: SnapshotManifest['type']) => {
    switch (type) {
      case 'manual':
        return <span className="bg-blue-950/40 text-blue-400 border border-blue-900/40 px-1.5 py-0.5 rounded text-[9px] font-bold">MANUAL</span>;
      case 'auto-backup':
        return <span className="bg-purple-950/40 text-purple-400 border border-purple-900/40 px-1.5 py-0.5 rounded text-[9px] font-bold">AUTO-BACKUP</span>;
      case 'pre-restore':
        return <span className="bg-pink-950/40 text-pink-400 border border-pink-900/40 px-1.5 py-0.5 rounded text-[9px] font-bold">PRE-RESTORE</span>;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden select-none font-mono text-xs">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-900 pb-2 shrink-0">
        <div>
          <h2 className="text-sm font-bold text-gray-200 flex items-center gap-1.5">
            <Archive className="w-4 h-4 text-blue-500" />
            <span>Workspace State Snapshot Engine</span>
          </h2>
          <p className="text-xs text-gray-500 leading-normal">Capture, restore, and perform differential comparison audits across project configurations, benchmarks, policies, and timelines.</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 overflow-hidden min-h-0">
        
        {/* Left Side (Col 1): Capture Snapshot and Filter Actions */}
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          
          {/* Capture Form */}
          <div className="bg-[#111827]/40 p-4 border border-gray-800 rounded-lg space-y-3">
            <span className="font-bold text-gray-300 uppercase tracking-wider text-[10px] block border-b border-gray-900 pb-1.5">Capture Snapshot</span>
            
            <form onSubmit={handleCapture} className="space-y-3">
              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] font-bold">Snapshot Description</label>
                <textarea
                  placeholder="e.g. Prior to modifying suno baseline thresholds..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded py-1.5 font-bold transition-all text-xs flex items-center justify-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Capture Snapshot</span>
              </button>
            </form>
          </div>

          {/* Filtering Card */}
          <div className="bg-[#111827]/40 p-4 border border-gray-800 rounded-lg space-y-3">
            <span className="font-bold text-gray-300 uppercase tracking-wider text-[10px] block border-b border-gray-900 pb-1.5">Filters & Telemetry</span>
            
            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] font-bold">Snapshot Type</label>
                <div className="flex flex-wrap gap-1">
                  {(['all', 'manual', 'auto-backup', 'pre-restore'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-2 py-0.5 rounded text-[10px] border capitalize ${
                        filterType === type
                          ? 'bg-blue-950/40 text-blue-400 border-blue-900/40 font-bold'
                          : 'text-gray-500 hover:text-gray-300 border-transparent bg-gray-950/20'
                      }`}
                    >
                      {type === 'all' ? 'All Types' : type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] font-bold">Integrity Status</label>
                <div className="flex flex-wrap gap-1">
                  {(['all', 'verified', 'unsigned', 'tampered'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => setFilterIntegrity(status)}
                      className={`px-2 py-0.5 rounded text-[10px] border capitalize ${
                        filterIntegrity === status
                          ? 'bg-blue-950/40 text-blue-400 border-blue-900/40 font-bold'
                          : 'text-gray-500 hover:text-gray-300 border-transparent bg-gray-950/20'
                      }`}
                    >
                      {status === 'all' ? 'All Status' : status === 'unsigned' ? 'No Checksum' : status === 'tampered' ? 'Mismatch' : status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Info Box */}
          <div className="p-3.5 bg-blue-950/5 border border-blue-900/20 rounded-lg text-gray-400 space-y-1.5 leading-relaxed text-[11px]">
            <div className="flex items-center gap-1.5 text-blue-400 font-bold uppercase text-[9px] tracking-wider mb-0.5">
              <Info className="w-3.5 h-3.5" />
              <span>Snapshot Mechanics</span>
            </div>
            Snapshots capture the current state of tests, judges, timeline events, and policies. If checksum validation flags a snapshot as <strong className="text-red-400">CHECKSUM MISMATCH</strong>, the engine will block state restoration to preserve data security. Checksums are unkeyed SHA-256 hashes: they detect accidental corruption and casual edits, not a determined tamperer who can recompute the hash.
          </div>

        </div>

        {/* Right Side (Cols 2-3): Snapshots Feed / Timeline and Comparison Panel */}
        <div className="xl:col-span-2 flex flex-col gap-4 overflow-hidden min-h-0">
          
          {/* Comparison Panel (Rendered only if compareResult exists) */}
          {compareResult && (
            <div className="bg-[#111827]/40 p-4 border border-blue-900/35 rounded-lg space-y-3 shrink-0">
              <div className="flex justify-between items-center border-b border-gray-900 pb-1.5">
                <span className="font-bold text-blue-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  <span>Snapshot Differential Report</span>
                </span>
                <button
                  onClick={clearComparison}
                  className="text-gray-500 hover:text-gray-300 hover:underline text-[10px]"
                >
                  Clear Comparison
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[10px]">
                <div className="p-2 bg-gray-950/25 border border-gray-900 rounded">
                  <span className="text-gray-500 uppercase font-bold text-[8.5px] block mb-1">Base Source (A)</span>
                  <span className="text-gray-300 font-bold truncate block">{compareResult.leftTitle}</span>
                </div>
                <div className="p-2 bg-gray-950/25 border border-gray-900 rounded">
                  <span className="text-gray-500 uppercase font-bold text-[8.5px] block mb-1">Target Source (B)</span>
                  <span className="text-gray-300 font-bold truncate block">{compareResult.rightTitle}</span>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-2 border border-gray-850 rounded divide-y divide-gray-850">
                
                {/* Metric rows */}
                {[
                  { label: 'Benchmarks Count', val: compareResult.benchmarks },
                  { label: 'Judges Count', val: compareResult.judges },
                  { label: 'Gold Standards Count', val: compareResult.goldStandards },
                  { label: 'Timeline Event Log Tally', val: compareResult.timelineEvents },
                  { label: 'Queued Candidates', val: compareResult.releaseCandidates },
                  { label: 'Failures Count', val: compareResult.failures }
                ].map((item, idx) => (
                  <div key={idx} className="p-2 flex justify-between items-center">
                    <span className="text-gray-400">{item.label}:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{item.val.left} &rarr; {item.val.right}</span>
                      {item.val.diff !== 0 && (
                        <span className={`font-bold px-1 py-0.5 rounded text-[9px] ${item.val.diff > 0 ? 'bg-green-950/40 text-green-400 border border-green-900/40' : 'bg-red-950/40 text-red-400 border border-red-900/40'}`}>
                          {item.val.diff > 0 ? `+${item.val.diff}` : item.val.diff}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Policies Details */}
                <div className="p-2 space-y-1.5">
                  <span className="text-gray-500 uppercase font-bold text-[8.5px] block">Governance Policy Parameter Changes</span>
                  <div className="grid grid-cols-3 gap-2 text-[10.5px] text-gray-400">
                    <div className="space-y-0.5">
                      <span>Min Score:</span>
                      <span className="text-gray-200 block font-bold">
                        {compareResult.policies.leftMinScore} &rarr; {compareResult.policies.rightMinScore}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span>Manual sign-off:</span>
                      <span className="text-gray-200 block font-bold">
                        {compareResult.policies.leftRequireApprove} &rarr; {compareResult.policies.rightRequireApprove}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span>Allow Regression:</span>
                      <span className="text-gray-200 block font-bold">
                        {compareResult.policies.leftAllowRegress} &rarr; {compareResult.policies.rightAllowRegress}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Snapshots Timeline List */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#111827]/20 border border-gray-800 rounded-lg p-4 space-y-3">
            
            <div className="flex justify-between items-center border-b border-gray-900 pb-2 shrink-0">
              <span className="font-bold text-gray-300 uppercase tracking-wider text-[10px]">Saved Snapshot Ledger</span>
              <span className="text-[10px] text-gray-500 font-bold">{filteredSnapshots.length} Record(s) found</span>
            </div>

            {filteredSnapshots.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-600 italic">
                No workspace snapshots found matching the current filters.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
                {filteredSnapshots.map(snap => {
                  const isLeftChecked = compareLeftId === snap.snapshotId;
                  const isRightChecked = compareRightId === snap.snapshotId;
                  const canRestore = snap.integrityStatus === 'verified' || snap.integrityStatus === 'unsigned';

                  return (
                    <div key={snap.snapshotId} className={`p-3 bg-[#111827]/40 border border-gray-850 rounded flex flex-col gap-2.5 font-mono text-xs transition-all ${
                      isLeftChecked || isRightChecked ? 'border-blue-900/50 bg-[#1e293b]/10' : ''
                    }`}>
                      
                      {/* Top Info */}
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-gray-200 block truncate max-w-[150px]">{snap.snapshotId}</span>
                          {getTypeBadge(snap.type)}
                          {getIntegrityBadge(snap.integrityStatus)}
                        </div>
                        <span className="text-[10px] text-gray-500">{new Date(snap.createdAt).toLocaleString()}</span>
                      </div>

                      {/* Description */}
                      <p className="text-gray-300 text-[11px] leading-relaxed select-text">&ldquo;{snap.description}&rdquo;</p>

                      {/* Actions footer */}
                      <div className="flex justify-between items-center border-t border-gray-900/40 pt-2 shrink-0">
                        {/* Comparison selection checkboxes */}
                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                          <label className="flex items-center gap-1 cursor-pointer hover:text-gray-300">
                            <input
                              type="checkbox"
                              checked={isLeftChecked}
                              onChange={() => {
                                if (isLeftChecked) {
                                  setCompareLeftId(null);
                                } else {
                                  setCompareLeftId(snap.snapshotId);
                                }
                              }}
                              className="bg-gray-900 border-gray-800 text-blue-500 rounded focus:ring-0 w-3 h-3"
                              disabled={isRightChecked}
                            />
                            <span>Compare Source (A)</span>
                          </label>
                          
                          <label className="flex items-center gap-1 cursor-pointer hover:text-gray-300">
                            <input
                              type="checkbox"
                              checked={isRightChecked}
                              onChange={() => {
                                if (isRightChecked) {
                                  setCompareRightId(null);
                                } else {
                                  setCompareRightId(snap.snapshotId);
                                }
                              }}
                              className="bg-gray-900 border-gray-800 text-blue-500 rounded focus:ring-0 w-3 h-3"
                              disabled={isLeftChecked}
                            />
                            <span>Compare Target (B)</span>
                          </label>
                        </div>

                        {/* Recovery and execution button */}
                        <button
                          onClick={() => setConfirmRestoreId(snap.snapshotId)}
                          disabled={!canRestore}
                          className={`rounded px-3 py-1 font-bold text-[10px] transition-all flex items-center gap-1 ${
                            canRestore
                              ? 'bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-900/40'
                              : 'bg-gray-950 text-gray-700 border border-transparent cursor-not-allowed'
                          }`}
                          title={canRestore ? 'Restore workspace configuration and data to this checkpoint' : 'Restoration blocked due to integrity hash validation failure.'}
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore State</span>
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

            {/* Global comparison triggers */}
            {(compareLeftId || compareRightId) && !compareResult && (
              <div className="p-2.5 bg-blue-950/20 border border-blue-900/30 rounded flex justify-between items-center text-[10px] shrink-0 font-mono">
                <div className="text-gray-400">
                  Select comparison target: 
                  <strong className="text-blue-400 ml-1">{(snapshotsList.find(s => s.snapshotId === compareLeftId)?.snapshotId) || 'None'}</strong>
                  <span className="mx-1">&harr;</span>
                  <strong className="text-blue-400">
                    {compareRightId ? snapshotsList.find(s => s.snapshotId === compareRightId)?.snapshotId : 'Live Operational State'}
                  </strong>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!compareRightId) {
                        setCompareRightId('live');
                      }
                      executeComparison();
                    }}
                    disabled={isComparing}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 font-bold transition-all text-[9.5px]"
                  >
                    {isComparing ? 'Comparing...' : 'Run Diff Audit'}
                  </button>
                  <button
                    onClick={clearComparison}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* 1. Restore Confirmation Dialog Modal */}
      {confirmRestoreId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 font-mono text-xs select-none p-4">
          <div className="bg-[#0f172a] border border-gray-800 rounded-lg p-5 max-w-md w-full space-y-4">
            
            <div className="flex items-center gap-2 border-b border-gray-900 pb-2 text-amber-500">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
              <span className="text-sm font-bold uppercase tracking-wider">Confirm State Recovery</span>
            </div>

            <div className="space-y-2 text-gray-400 leading-relaxed text-[11px]">
              <p>You are about to restore the workspace state to snapshot <strong className="text-gray-200">{confirmRestoreId}</strong>.</p>
              
              <div className="p-2.5 bg-amber-950/10 border border-amber-900/30 rounded text-amber-500 text-[10px]">
                <strong>Operational Safeguard:</strong> The engine will automatically capture a safety backup of your current live workspace state labeled <code>pre-restore</code> before proceeding.
              </div>

              <p>This action will overwrite current benchmarks, policies, failures, and timeline event logs. Volatile components (PTY terminal sessions, active ports) will remain unaffected.</p>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-900">
              {isRestoring ? (
                <div className="text-[10px] text-blue-400 flex items-center gap-2 font-bold animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{restoreMessage}</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmRestoreId(null)}
                    className="text-gray-500 hover:text-gray-300 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRestore(confirmRestoreId)}
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all"
                  >
                    Restore Checkpoint
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
export default SnapshotsView;
