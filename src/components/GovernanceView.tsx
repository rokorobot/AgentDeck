import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  ShieldCheck, 
  CheckCircle, 
  Send,
  AlertTriangle,
  Fingerprint,
  Activity,
  Lock,
  Shield,
  History
} from 'lucide-react';
import { GovernancePolicy, ReleaseCandidate } from '../types/governance';
import { runGovernanceIntegrityCheck } from '../lib/governanceIntegrity';
import { DecisionEvidenceView } from './DecisionEvidenceView';

export const GovernanceView: React.FC = () => {
  const { 
    activeWorkspace, 
    governancePolicies, 
    releaseCandidates, 
    saveGovernancePolicies, 
    updateReleaseCandidateStatus,
    benchmarks,
    timelineEvents,
    regressionRuns,
    promotions,
    sealGovernanceRecords,
    provenanceList
  } = useWorkspaceStore();

  const [minScore, setMinScore] = useState(governancePolicies?.minScore || 0.80);
  const [allowRegression, setAllowRegression] = useState(governancePolicies?.allowRegression || false);
  const [requireApproval, setRequireApproval] = useState(governancePolicies?.requireApproval || false);
  
  const [notesText, setNotesText] = useState<Record<string, string>>({});
  const [isEditingPolicies, setIsEditingPolicies] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'queue' | 'health' | 'provenance' | 'decision'>('queue');

  if (!activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 font-mono">
        No active workspace selected.
      </div>
    );
  }

  const healthReport = runGovernanceIntegrityCheck({
    policies: governancePolicies,
    releaseCandidates,
    timelineEvents,
    benchmarks,
    regressionRuns,
    promotions
  });

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    const policy: GovernancePolicy = {
      schemaVersion: 'agentdeck.governance.v1',
      minScore,
      allowRegression,
      requireApproval
    };
    await saveGovernancePolicies(policy);
    setIsEditingPolicies(false);
  };

  const handleUpdateStatus = async (id: string, status: ReleaseCandidate['status']) => {
    const note = notesText[id] || '';
    await updateReleaseCandidateStatus(id, status, note);
    // Clear notes for this candidate
    setNotesText(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const pendingCandidates = releaseCandidates.filter(c => c.status === 'pending');
  const approvedCandidates = releaseCandidates.filter(c => c.status === 'approved');
  const pastCandidates = releaseCandidates.filter(c => c.status === 'released' || c.status === 'rejected');

  const getPolicyResultBadge = (result: ReleaseCandidate['policyResult']) => {
    switch (result) {
      case 'pass':
        return <span className="bg-green-950/40 text-green-400 border border-green-900/40 px-2 py-0.5 rounded text-[9px] font-bold">POLICY PASSED</span>;
      case 'requires_approval':
        return <span className="bg-blue-950/40 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded text-[9px] font-bold">REQUIRES APPROVAL</span>;
      case 'blocked':
        return <span className="bg-red-950/40 text-red-400 border border-red-900/40 px-2 py-0.5 rounded text-[9px] font-bold">BLOCKED / VIOLATION</span>;
    }
  };

  const getStatusBadge = (status: ReleaseCandidate['status']) => {
    switch (status) {
      case 'pending':
        return <span className="bg-amber-950/40 text-amber-500 border border-amber-900/40 px-2 py-0.5 rounded text-[9px] font-bold">PENDING REVIEW</span>;
      case 'approved':
        return <span className="bg-blue-950/40 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded text-[9px] font-bold">APPROVED RC</span>;
      case 'released':
        return <span className="bg-green-950/40 text-green-400 border border-green-900/40 px-2 py-0.5 rounded text-[9px] font-bold">RELEASED</span>;
      case 'rejected':
        return <span className="bg-red-950/40 text-red-400 border border-red-900/40 px-2 py-0.5 rounded text-[9px] font-bold">REJECTED</span>;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-900 pb-2 shrink-0">
        <div>
          <h2 className="text-sm font-bold font-mono text-gray-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <span>AI Quality Governance Center</span>
          </h2>
          <p className="text-xs text-gray-500 font-mono">Enforce score thresholds, manage release candidate lifecycles, and edit compliance parameters.</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b border-gray-900 pb-1.5 font-mono text-xs shrink-0">
        <button
          onClick={() => setActiveSubTab('queue')}
          className={`px-3 py-1 rounded transition-all ${
            activeSubTab === 'queue'
              ? 'bg-blue-950/40 text-blue-400 border border-blue-900/40 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
          }`}
        >
          Compliance Center
        </button>
        <button
          onClick={() => setActiveSubTab('health')}
          className={`px-3 py-1 rounded transition-all flex items-center gap-1.5 ${
            activeSubTab === 'health'
              ? 'bg-blue-950/40 text-blue-400 border border-blue-900/40 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
          }`}
        >
          <span>Governance Health</span>
          {healthReport.status === 'healthy' ? (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          ) : healthReport.status === 'warning' ? (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('provenance')}
          className={`px-3 py-1 rounded transition-all flex items-center gap-1.5 ${
            activeSubTab === 'provenance'
              ? 'bg-blue-950/40 text-blue-400 border border-blue-900/40 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Causality & Provenance</span>
        </button>
        <button
          onClick={() => setActiveSubTab('decision')}
          className={`px-3 py-1 rounded transition-all flex items-center gap-1.5 ${
            activeSubTab === 'decision'
              ? 'bg-blue-950/40 text-blue-400 border border-blue-900/40 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-blue-500" />
          <span>Decision Evidence (DEP)</span>
        </button>
      </div>

      {activeSubTab === 'health' ? (
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 font-mono text-xs max-w-4xl">
          
          {/* Status Hero Card */}
          <div className={`p-4 rounded-lg border flex flex-wrap justify-between items-center gap-4 ${
            healthReport.status === 'healthy' 
              ? 'bg-green-950/10 border-green-900/40 text-green-400'
              : healthReport.status === 'warning'
                ? 'bg-amber-950/10 border-amber-900/40 text-amber-500'
                : 'bg-red-950/10 border-red-900/40 text-red-400'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {healthReport.status === 'healthy' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                <span className="font-bold uppercase tracking-wider text-xs">
                  Governance Health: {healthReport.status.toUpperCase()}
                </span>
              </div>
              <p className="text-gray-400 text-[11px]">
                {healthReport.status === 'healthy'
                  ? 'All local governance criteria satisfied. Files checksummed and references verified.'
                  : healthReport.status === 'warning'
                    ? 'Compliance warning: legacy records without an integrity checksum detected. Recompute checksums to update records.'
                    : 'CRITICAL ERROR: Integrity checks failed — one or more files no longer match their stored checksum.'}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-bold text-gray-200">{healthReport.passedCount} / {healthReport.totalCount}</div>
                <div className="text-[9px] text-gray-500">CHECKS PASSED</div>
              </div>
              {healthReport.checks.some(c => c.status === 'warning') && (
                <button
                  onClick={async () => {
                    await sealGovernanceRecords();
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 font-bold text-[10px] transition-all flex items-center gap-1.5"
                  title="Recompute integrity checksums for legacy records"
                >
                  <Lock className="w-3 h-3" />
                  <span>Recompute Checksums</span>
                </button>
              )}
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Policies Health Card */}
            <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-1.5">
              <div className="flex justify-between items-center text-gray-500">
                <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400">Policies Status</span>
                <Shield className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-[11px] leading-relaxed text-gray-400">
                Schema: <code className="text-gray-200">{governancePolicies?.schemaVersion || 'N/A'}</code>
                <br />
                Integrity: <span className={
                  governancePolicies?.integrityStatus === 'verified'
                    ? 'text-green-400 font-bold'
                    : governancePolicies?.integrityStatus === 'unsigned'
                      ? 'text-amber-500 font-bold'
                      : 'text-red-500 font-bold'
                }>
                  {governancePolicies?.integrityStatus === 'verified' ? 'VERIFIED' : governancePolicies?.integrityStatus === 'tampered' ? 'CHECKSUM MISMATCH' : 'NO CHECKSUM'}
                </span>
              </div>
            </div>

            {/* Candidates Health Card */}
            <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-1.5">
              <div className="flex justify-between items-center text-gray-500">
                <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400">Candidates Queue</span>
                <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-[11px] leading-relaxed text-gray-400">
                Total: <strong className="text-gray-200">{releaseCandidates.length}</strong> candidates
                <br />
                Integrity: <span className={
                  releaseCandidates.some(rc => rc.integrityStatus === 'tampered')
                    ? 'text-red-500 font-bold'
                    : releaseCandidates.some(rc => rc.integrityStatus === 'unsigned')
                      ? 'text-amber-500 font-bold'
                      : 'text-green-400 font-bold'
                }>
                  {releaseCandidates.some(rc => rc.integrityStatus === 'tampered')
                    ? 'CHECKSUM MISMATCH'
                    : releaseCandidates.some(rc => rc.integrityStatus === 'unsigned')
                      ? 'NO CHECKSUM'
                      : 'VERIFIED'}
                </span>
              </div>
            </div>

            {/* Timeline Health Card */}
            <div className="p-3 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-1.5">
              <div className="flex justify-between items-center text-gray-500">
                <span className="font-bold uppercase text-[9px] tracking-wider text-gray-400">Operational Timeline</span>
                <Activity className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-[11px] leading-relaxed text-gray-400">
                Total Events: <strong className="text-gray-200">{timelineEvents.length}</strong>
                <br />
                Integrity: <span className={
                  timelineEvents.some(e => e.integrityStatus === 'tampered')
                    ? 'text-red-500 font-bold'
                    : timelineEvents.some(e => e.integrityStatus === 'unsigned')
                      ? 'text-amber-500 font-bold'
                      : 'text-green-400 font-bold'
                }>
                  {timelineEvents.some(e => e.integrityStatus === 'tampered')
                    ? 'CHECKSUM MISMATCH'
                    : timelineEvents.some(e => e.integrityStatus === 'unsigned')
                      ? 'NO CHECKSUM'
                      : 'VERIFIED'}
                </span>
              </div>
            </div>

          </div>

          {/* Detailed Verification Checks list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wider">Detailed Verification Log</h3>
            
            <div className="border border-gray-850 rounded-lg overflow-hidden divide-y divide-gray-850">
              {healthReport.checks.map(check => (
                <div key={check.id} className="p-3 bg-[#111827]/20 flex items-start gap-3">
                  <div className="pt-0.5 shrink-0">
                    {check.status === 'pass' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : check.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-200">{check.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                        check.status === 'pass'
                          ? 'bg-green-950/40 text-green-400 border border-green-900/40'
                          : check.status === 'warning'
                            ? 'bg-amber-950/40 text-amber-500 border border-amber-900/40'
                            : 'bg-red-950/40 text-red-500 border border-red-900/40'
                      }`}>
                        {check.status === 'pass' ? 'passed' : check.status === 'warning' ? 'warning' : 'failed'}
                      </span>
                    </div>
                    <p className="text-gray-400 text-[11px] leading-relaxed">{check.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : activeSubTab === 'provenance' ? (
        <div className="flex-1 overflow-y-auto pr-1 font-mono text-xs max-w-4xl space-y-4">
          <div className="flex items-center gap-2 mb-4 bg-purple-950/20 text-purple-400 p-3 rounded border border-purple-900/40">
            <History className="w-5 h-5" />
            <div>
              <div className="font-bold uppercase tracking-wider text-sm">Causality Ledger</div>
              <div className="text-[10px] text-gray-400">Immutable record of state mutations, configuration changes, and operational origins.</div>
            </div>
          </div>
          
          {provenanceList.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
              No causality records found.
            </div>
          ) : (
            <div className="space-y-3">
              {provenanceList.map(record => (
                <div key={record.id} className="p-3 bg-[#111827]/30 border border-gray-800 rounded-lg space-y-2">
                  <div className="flex justify-between items-center border-b border-gray-900/50 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-purple-950/40 text-purple-400 border border-purple-900/40 px-2 py-0.5 rounded text-[9px] font-bold uppercase">{record.mutationType.replace(/_/g, ' ')}</span>
                      <span className="text-gray-400">Target: <strong className="text-gray-300">{record.sourceType} ({record.sourceId})</strong></span>
                    </div>
                    <span className="text-[10px] text-gray-500">{new Date(record.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase font-bold text-gray-500">Before</span>
                      <pre className="bg-gray-950/50 border border-gray-900 p-2 rounded text-[10px] text-gray-400 overflow-x-auto">
                        {JSON.stringify(record.before, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase font-bold text-gray-500">After</span>
                      <pre className="bg-gray-950/50 border border-gray-900 p-2 rounded text-[10px] text-green-400/80 overflow-x-auto">
                        {JSON.stringify(record.after, null, 2)}
                      </pre>
                    </div>
                  </div>
                  {record.integrityStatus && record.integrityStatus !== 'verified' && (
                    <div className="pt-2 border-t border-gray-900/50 text-[10px]">
                      <span className="text-gray-500 mr-2">Integrity Status:</span>
                      <span className={`font-bold uppercase ${record.integrityStatus === 'tampered' ? 'text-red-500' : 'text-amber-500'}`}>
                        {record.integrityStatus}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeSubTab === 'decision' ? (
        <DecisionEvidenceView />
      ) : (
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 overflow-y-auto pr-1">
          
          {/* Left Side (Col 1): Policies Settings */}
          <div className="space-y-4 font-mono text-xs">
            <div className="bg-[#111827]/40 p-4 border border-gray-800 rounded-lg space-y-4">
              <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                <span className="font-bold text-gray-300 uppercase tracking-wider text-[10px]">Governance Policy Parameters</span>
                <button 
                  onClick={() => setIsEditingPolicies(!isEditingPolicies)}
                  className="text-blue-400 hover:text-blue-300 hover:underline text-[10px]"
                >
                  {isEditingPolicies ? 'Cancel' : 'Edit Rules'}
                </button>
              </div>

              {!isEditingPolicies ? (
                <div className="space-y-3">
                  <div className="bg-[#0B0F14] border border-gray-850 p-3 rounded space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                      <span>MINIMUM QUALITY SCORE</span>
                      <span className="text-blue-400 font-bold">{governancePolicies?.minScore || 0.80}</span>
                    </div>
                    <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${(governancePolicies?.minScore || 0.80) * 100}%` }} />
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2.5 bg-[#0B0F14]/60 border border-gray-850 rounded">
                    <span className="text-gray-400">Allow Regressed Builds</span>
                    <strong className={governancePolicies?.allowRegression ? 'text-green-400' : 'text-red-400'}>
                      {governancePolicies?.allowRegression ? 'ENABLED' : 'DISABLED'}
                    </strong>
                  </div>

                  <div className="flex justify-between items-center p-2.5 bg-[#0B0F14]/60 border border-gray-850 rounded">
                    <span className="text-gray-400">Require Manual Approval</span>
                    <strong className={governancePolicies?.requireApproval ? 'text-green-400' : 'text-amber-500'}>
                      {governancePolicies?.requireApproval ? 'ENABLED' : 'DISABLED'}
                    </strong>
                  </div>

                  <div className="text-[10px] text-gray-500 leading-relaxed pt-1 select-text">
                    Policy schema spec: <code className="text-gray-400">{governancePolicies?.schemaVersion || 'agentdeck.governance.v1'}</code>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSavePolicies} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <label className="text-gray-500 uppercase text-[9px] font-bold">Min Target Score ({minScore})</label>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={minScore}
                      onChange={(e) => setMinScore(parseFloat(e.target.value))}
                      className="w-full bg-gray-800 accent-blue-500"
                    />
                    <div className="flex justify-between text-[9px] text-gray-600">
                      <span>0.00 (Draft)</span>
                      <span>1.00 (Perfect)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-[#0B0F14] border border-gray-850 rounded">
                    <label className="text-gray-400">Allow Regression</label>
                    <input
                      type="checkbox"
                      checked={allowRegression}
                      onChange={(e) => setAllowRegression(e.target.checked)}
                      className="w-4 h-4 bg-gray-850 border-gray-850 text-blue-600 focus:ring-blue-500 rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2 bg-[#0B0F14] border border-gray-850 rounded">
                    <label className="text-gray-400">Require Sign-off</label>
                    <input
                      type="checkbox"
                      checked={requireApproval}
                      onChange={(e) => setRequireApproval(e.target.checked)}
                      className="w-4 h-4 bg-gray-850 border-gray-850 text-blue-600 focus:ring-blue-500 rounded"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded py-1.5 font-bold transition-all text-xs"
                  >
                    Save Governance Policies
                  </button>
                </form>
              )}
            </div>

            {/* Quick dashboard status card link */}
            <div className={`p-4 border rounded-lg flex justify-between items-center gap-2 ${
              healthReport.status === 'healthy'
                ? 'bg-green-950/5 border-green-900/30 text-green-400'
                : healthReport.status === 'warning'
                  ? 'bg-amber-950/5 border-amber-900/30 text-amber-500'
                  : 'bg-red-950/5 border-red-900/30 text-red-400'
            }`}>
              <div className="space-y-1">
                <span className="font-bold text-[10px] tracking-wider uppercase block">System Health Status</span>
                <span className="text-[11px] text-gray-300">{healthReport.status.toUpperCase()} ({healthReport.passedCount}/{healthReport.totalCount} Checks)</span>
              </div>
              <button 
                onClick={() => setActiveSubTab('health')}
                className="text-[10px] text-blue-400 hover:underline uppercase font-bold"
              >
                Inspect
              </button>
            </div>
          </div>

          {/* Right Side (Cols 2-3): Pending Candidates and Release Ledger */}
          <div className="xl:col-span-2 space-y-6 font-mono text-xs">
            
            {/* Section 2: Release Candidate Queue */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wider">Release Candidates Queue</h3>
              
              {pendingCandidates.length === 0 && approvedCandidates.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                  No active release candidates pending review. Execute a regression set below threshold limits to queue candidates.
                </div>
              ) : (
                <div className="space-y-4">
                  
                  {/* 1. Pending Review */}
                  {pendingCandidates.map((c) => {
                    const bName = benchmarks.find(b => b.id === c.benchmarkId)?.name || c.benchmarkId;
                    const isBlocked = c.policyResult === 'blocked';

                    return (
                      <div key={c.id} className="p-4 bg-[#111827]/30 border border-gray-800 rounded-lg space-y-3 relative">
                        
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-200">{c.version}</span>
                            {getPolicyResultBadge(c.policyResult)}
                            {getStatusBadge(c.status)}
                          </div>
                          <span className="text-[10px] text-gray-500">Queued: {new Date(c.timestamp).toLocaleTimeString()}</span>
                        </div>

                        <div className="p-3 bg-[#0B0F14] border border-gray-850 rounded text-[11px] space-y-2">
                          <div className="flex justify-between text-gray-400">
                            <span>Target Benchmark:</span>
                            <span className="font-semibold text-gray-200">{bName}</span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Outbound Score:</span>
                            <span className={`font-bold ${isBlocked ? 'text-red-400' : 'text-blue-400'}`}>{c.score}</span>
                          </div>
                          {c.baselineScore !== undefined && (
                            <div className="flex justify-between text-gray-400">
                              <span>Baseline Score:</span>
                              <span className="text-gray-300 font-semibold">{c.baselineScore}</span>
                            </div>
                          )}
                          {c.regressionDelta !== undefined && (
                            <div className="flex justify-between text-gray-400">
                              <span>Regression Delta:</span>
                              <span className={`font-bold ${c.regressionDelta < 0 ? 'text-red-500' : 'text-green-400'}`}>
                                {c.regressionDelta < 0 ? c.regressionDelta : `+${c.regressionDelta}`}
                              </span>
                            </div>
                          )}
                          {c.integrityStatus && c.integrityStatus !== 'verified' && (
                            <div className="flex justify-between text-gray-400 border-t border-gray-900 pt-1.5">
                              <span>Integrity Checksum:</span>
                              <span className={`font-bold uppercase ${c.integrityStatus === 'tampered' ? 'text-red-500' : 'text-amber-500'}`}>
                                {c.integrityStatus === 'tampered' ? 'Checksum Mismatch' : 'No Checksum'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Policy Reasons list */}
                        <div className="space-y-1 bg-gray-950/20 p-2.5 rounded border border-gray-900">
                          <span className="text-gray-500 text-[9px] uppercase font-bold block">Compliance Reasons:</span>
                          <ul className="list-disc list-inside text-gray-400 text-[10px] space-y-0.5">
                            {c.policyReasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Lifecycle Controls */}
                        <div className="space-y-2 pt-2 border-t border-gray-900">
                          <div className="space-y-1">
                            <label className="text-gray-500 uppercase text-[9px] font-bold">Operator Review Notes</label>
                            <textarea
                              placeholder="Add compliance notes, audit observations or override reasoning..."
                              value={notesText[c.id] || ''}
                              onChange={(e) => setNotesText(prev => ({ ...prev, [c.id]: e.target.value }))}
                              rows={2}
                              className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                            />
                          </div>

                          <div className="flex justify-end gap-2.5 pt-1">
                            <button
                              onClick={() => handleUpdateStatus(c.id, 'rejected')}
                              className="bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-900/40 px-3 py-1 rounded text-[10px] font-bold transition-all"
                              title="Reject release candidate"
                            >
                              Reject Candidate
                            </button>
                            
                            <button
                              onClick={() => handleUpdateStatus(c.id, 'approved')}
                              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1 font-bold text-[10px] transition-all flex items-center gap-1"
                              title="Approve release candidate"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Approve Candidate</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}

                  {/* 2. Approved (Pending Production Release) */}
                  {approvedCandidates.map((c) => {
                    const bName = benchmarks.find(b => b.id === c.benchmarkId)?.name || c.benchmarkId;

                    return (
                      <div key={c.id} className="p-4 bg-blue-950/5 border border-blue-900/30 rounded-lg space-y-3 relative">
                        
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-200">{c.version}</span>
                            {getStatusBadge(c.status)}
                          </div>
                          <span className="text-[10px] text-gray-500">Approved: {c.approvedAt ? new Date(c.approvedAt).toLocaleTimeString() : 'N/A'}</span>
                        </div>

                        <div className="text-[11px] text-gray-300">
                          Candidate approved with score <strong className="text-blue-400 font-bold">{c.score}</strong> for suite <strong className="text-gray-200">{bName}</strong>.
                        </div>

                        {c.notes && (
                          <div className="p-2 bg-gray-900/40 rounded border border-gray-950 text-gray-400 italic">
                            &ldquo;{c.notes}&rdquo;
                          </div>
                        )}

                        {/* Release lifecycle control */}
                        <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-900/40">
                          <button
                            onClick={() => handleUpdateStatus(c.id, 'released')}
                            className="bg-green-600 hover:bg-green-500 text-white rounded px-4 py-1 font-bold text-[10px] transition-all flex items-center gap-1"
                            title="Deploy version to production release stage"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Release to Production</span>
                          </button>
                        </div>

                      </div>
                    );
                  })}

                </div>
              )}
            </div>

            {/* Section 3: Historical Release Ledger */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wider">Historical Release Ledger</h3>
              
              {pastCandidates.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                  No past candidate records stored.
                </div>
              ) : (
                <div className="space-y-2">
                  {pastCandidates.map((c) => {
                    const bName = benchmarks.find(b => b.id === c.benchmarkId)?.name || c.benchmarkId;

                    return (
                      <div key={c.id} className="p-3 bg-[#111827]/20 border border-gray-850 rounded flex flex-col gap-2 font-mono text-xs">
                        
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-200">{c.version}</span>
                            <span className="text-gray-500">({bName})</span>
                            {getStatusBadge(c.status)}
                          </div>
                          <span className="text-[10px] text-gray-500">{new Date(c.timestamp).toLocaleString()}</span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-gray-400 bg-gray-950/30 p-1.5 rounded">
                          <span>Quality target score: <strong className="text-blue-400 font-bold">{c.score}</strong></span>
                          <span>Sign-off: <strong className="text-gray-300 uppercase">{c.approvedBy}</strong></span>
                        </div>

                        {c.notes && (
                          <div className="text-[11px] text-gray-400 italic bg-[#0B0F14]/40 p-2 rounded border border-gray-900/60">
                            &ldquo;{c.notes}&rdquo;
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
      )}

    </div>
  );
};
export default GovernanceView;
