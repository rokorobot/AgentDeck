import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  ShieldCheck, 
  FileText, 
  Lock, 
  Download, 
  RefreshCw, 
  ArrowRight,
  ShieldAlert,
  FileJson
} from 'lucide-react';
import { DecisionEvidencePackage } from '../types/decisionEvidence';

export const DecisionEvidenceView: React.FC = () => {
  const {
    releaseCandidates,
    decisionEvidenceList,
    generateDecisionEvidence,
    signAndSaveDecisionEvidence,
    verifyDecisionEvidence,
    exportDecisionEvidenceJson,
    exportDecisionEvidenceMarkdown,
    loadDecisionEvidence
  } = useWorkspaceStore();

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [previewDep, setPreviewDep] = useState<DecisionEvidencePackage | null>(null);
  const [decisionRationale, setDecisionRationale] = useState<string>('');
  const [decisionClass, setDecisionClass] = useState<'routine' | 'material' | 'critical'>('routine');
  const [overrideDecision, setOverrideDecision] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');

  const [verificationResults, setVerificationResults] = useState<Record<string, any>>({});
  const [isVerifying, setIsVerifying] = useState<Record<string, boolean>>({});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'create' | 'archive'>('create');

  useEffect(() => {
    loadDecisionEvidence();
  }, []);

  const handleGeneratePreview = async () => {
    if (!selectedCandidateId) return;
    setIsGenerating(true);
    try {
      const dep = await generateDecisionEvidence(selectedCandidateId);
      setPreviewDep(dep);
      // Reset form variables
      setDecisionRationale('');
      setDecisionClass(dep.decisionClass || 'routine');
      setOverrideDecision(false);
      setOverrideReason('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSignAndSave = async () => {
    if (!previewDep) return;
    setIsSaving(true);
    try {
      const payloadDep = { ...previewDep };
      if (overrideDecision) {
        payloadDep.decisionType = previewDep.recommendation.decision === 'APPROVE' ? 'reject' : 'approve';
      } else {
        payloadDep.decisionType = previewDep.recommendation.decision === 'APPROVE' ? 'approve' : 'reject';
      }

      const result = await signAndSaveDecisionEvidence(
        payloadDep,
        decisionRationale,
        decisionClass,
        overrideDecision ? overrideReason : undefined
      );

      if (result.success) {
        setPreviewDep(null);
        setSelectedCandidateId('');
        setActiveTab('archive');
        loadDecisionEvidence();
      } else {
        alert(`Failed to sign and save: ${result.error}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error signing package: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerify = async (depId: string) => {
    setIsVerifying(prev => ({ ...prev, [depId]: true }));
    try {
      const result = await verifyDecisionEvidence(depId);
      setVerificationResults(prev => ({ ...prev, [depId]: result }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifying(prev => ({ ...prev, [depId]: false }));
    }
  };

  const handleExportJson = async (depId: string) => {
    try {
      await exportDecisionEvidenceJson(depId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportMarkdown = async (depId: string) => {
    try {
      await exportDecisionEvidenceMarkdown(depId);
    } catch (err) {
      console.error(err);
    }
  };

  // Helper to extract nested section content safely
  const getSectionContent = (dep: DecisionEvidencePackage | null, sectionId: string) => {
    if (!dep) return null;
    return dep.evidence.find(s => s.layerId === sectionId)?.content;
  };

  const pendingCandidates = releaseCandidates.filter(c => c.status === 'pending');

  return (
    <div className="flex-1 flex flex-col min-h-0 font-mono text-xs text-gray-300">
      
      {/* Top Toggle */}
      <div className="flex border-b border-gray-900 pb-3 mb-4 shrink-0">
        <div className="flex bg-[#0B0F14] border border-gray-850 p-0.5 rounded">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-1.5 rounded transition-all font-bold ${
              activeTab === 'create'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Draft Compliance DEP
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`px-4 py-1.5 rounded transition-all font-bold flex items-center gap-1.5 ${
              activeTab === 'archive'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>Signed Registry</span>
            <span className="bg-[#1F2937] text-gray-400 text-[9px] px-1.5 py-0.5 rounded-full">
              {decisionEvidenceList.length}
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-5 overflow-hidden">
        
        {/* CREATE TAB */}
        {activeTab === 'create' && (
          <div className="flex-1 flex gap-5 overflow-hidden">
            
            {/* Draft controls (Left panel) */}
            <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
              <div className="bg-[#111827]/40 p-4 border border-gray-800 rounded-lg space-y-4">
                <span className="font-bold text-gray-300 uppercase tracking-wider text-[10px] block border-b border-gray-900 pb-2">
                  1. Select Target Candidate
                </span>

                <div className="space-y-2">
                  <label className="text-gray-500 font-bold uppercase text-[9px]">Release Candidate</label>
                  <select
                    value={selectedCandidateId}
                    onChange={(e) => {
                      setSelectedCandidateId(e.target.value);
                      setPreviewDep(null);
                    }}
                    className="w-full bg-[#0B0F14] border border-gray-800 text-gray-200 px-2 py-1.5 rounded focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choose Candidate --</option>
                    {pendingCandidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.version} (Score: {c.score} | Status: {c.status})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleGeneratePreview}
                  disabled={!selectedCandidateId || isGenerating}
                  className={`w-full py-2 rounded font-bold transition-all text-xs flex items-center justify-center gap-1.5 ${
                    !selectedCandidateId || isGenerating
                      ? 'bg-gray-800/40 text-gray-600 border border-gray-850 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-700'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating Evidence...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      <span>Compile Governance DEP</span>
                    </>
                  )}
                </button>
              </div>

              {previewDep && (
                <div className="bg-[#111827]/40 p-4 border border-gray-800 rounded-lg space-y-4">
                  <span className="font-bold text-gray-300 uppercase tracking-wider text-[10px] block border-b border-gray-900 pb-2">
                    2. Rationale & Attestation
                  </span>

                  <div className="space-y-1.5">
                    <label className="text-gray-500 font-bold uppercase text-[9px]">Decision Class</label>
                    <div className="grid grid-cols-3 gap-1 bg-[#0B0F14] p-0.5 border border-gray-800 rounded">
                      {(['routine', 'material', 'critical'] as const).map(cls => (
                        <button
                          key={cls}
                          onClick={() => setDecisionClass(cls)}
                          className={`py-1 rounded text-[9px] font-bold uppercase transition-all ${
                            decisionClass === cls
                              ? 'bg-blue-600/20 text-blue-400 border border-blue-800/30'
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-gray-500 font-bold uppercase text-[9px] flex justify-between">
                      <span>Compliance Rationale</span>
                      <span className="text-red-500">* Required</span>
                    </label>
                    <textarea
                      value={decisionRationale}
                      onChange={(e) => setDecisionRationale(e.target.value)}
                      placeholder="Input formal Board rationales. Document business case or code changes risk justifications..."
                      rows={4}
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none p-2 rounded text-gray-200 placeholder-gray-600 text-[11px]"
                    />
                  </div>

                  {/* Recommendation and Override Checkbox */}
                  <div className="border border-gray-850 p-2.5 rounded bg-[#0B0F14]/50 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 font-bold">Rule Recommendation:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        previewDep.recommendation.decision === 'APPROVE' 
                          ? 'bg-green-950/40 text-green-400 border border-green-900/40'
                          : 'bg-red-950/40 text-red-400 border border-red-900/40'
                      }`}>
                        {previewDep.recommendation.decision}
                      </span>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={overrideDecision}
                        onChange={(e) => setOverrideDecision(e.target.checked)}
                        className="w-3.5 h-3.5 bg-gray-900 border-gray-800 focus:ring-blue-500 rounded text-blue-600"
                      />
                      <span className="text-gray-400 select-none">Override Recommendation</span>
                    </label>

                    {overrideDecision && (
                      <div className="space-y-1.5 pt-1.5">
                        <label className="text-gray-500 font-bold uppercase text-[9px] flex justify-between">
                          <span>Override Reason</span>
                          <span className="text-red-500">* Required</span>
                        </label>
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Provide audit-ready justification for overriding the risk engine scoring recommendation..."
                          rows={2.5}
                          className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none p-2 rounded text-gray-200 placeholder-gray-600 text-[11px]"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleSignAndSave}
                    disabled={isSaving || !decisionRationale || (overrideDecision && !overrideReason)}
                    className={`w-full py-2 rounded font-bold transition-all text-xs flex items-center justify-center gap-1.5 border ${
                      isSaving || !decisionRationale || (overrideDecision && !overrideReason)
                        ? 'bg-gray-800/40 text-gray-600 border-gray-850 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-500 text-white border-green-700 shadow-md shadow-green-950/30'
                    }`}
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Signing Board Seal...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Sign off & Finalize DEP</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Preview Inspector & Timeline (Right panel) */}
            <div className="flex-1 flex flex-col bg-[#111827]/10 border border-gray-850 rounded-lg p-4 overflow-y-auto">
              {!previewDep ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 p-8 space-y-3">
                  <ShieldCheck className="w-12 h-12 text-gray-700" />
                  <div>
                    <h3 className="font-bold text-gray-400">Generate DEP Preview</h3>
                    <p className="max-w-md text-[11px] text-gray-600 leading-relaxed pt-1">
                      Choose a release candidate on the left to compute compliance rules, aggregate operational diagnostics, calculate points, and inspect the frozen compliance packages.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Top Summary Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-900 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-gray-200">Compliance Preview: {previewDep.id}</h2>
                        <span className="bg-blue-950/50 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded text-[9px] uppercase font-bold">PREVIEW DRAFT</span>
                      </div>
                      <p className="text-[10px] text-gray-500 pt-0.5">Workspace Target: {previewDep.workspaceId}</p>
                    </div>

                    <div className="flex gap-4">
                      <div className="text-right">
                        <span className="text-[9px] text-gray-500 uppercase font-bold block">Evidence Sufficiency</span>
                        <span className={`font-bold ${previewDep.evidenceSufficiency === 'pass' ? 'text-green-400' : 'text-red-400'}`}>
                          {previewDep.evidenceSufficiency.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-gray-500 uppercase font-bold block">Risk score</span>
                        <span className="font-bold text-gray-200">
                          {getSectionContent(previewDep, 'risk-assessment')?.riskPoints || 0} PTS
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Decision Timeline Visualization */}
                  <div className="bg-[#0B0F14] border border-gray-850 p-4 rounded-lg space-y-3">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Decision Progression Path</h4>
                    
                    <div className="relative flex justify-between items-center pt-2 pb-1 font-mono text-[10px]">
                      {/* Connection Line */}
                      <div className="absolute top-[21px] left-8 right-8 h-[2px] bg-gray-800 z-0">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-500" 
                          style={{ width: '50%' }} 
                        />
                      </div>

                      {/* Step 1: Candidate */}
                      <div className="flex flex-col items-center text-center space-y-1.5 z-10 w-24">
                        <div className="w-5 h-5 rounded-full bg-green-950 border border-green-500 flex items-center justify-center text-green-400 font-bold text-[9px]">
                          ✓
                        </div>
                        <span className="font-semibold text-gray-200">Candidate Created</span>
                        <span className="text-[8px] text-gray-500">By: Operator</span>
                      </div>

                      {/* Step 2: DEP Generated */}
                      <div className="flex flex-col items-center text-center space-y-1.5 z-10 w-24">
                        <div className="w-5 h-5 rounded-full bg-green-950 border border-green-500 flex items-center justify-center text-green-400 font-bold text-[9px]">
                          ✓
                        </div>
                        <span className="font-semibold text-gray-200">DEP Generated</span>
                        <span className="text-[8px] text-gray-500">By: System</span>
                      </div>

                      {/* Step 3: DEP Reviewed */}
                      <div className="flex flex-col items-center text-center space-y-1.5 z-10 w-24">
                        <div className="w-5 h-5 rounded-full bg-blue-950 border border-blue-500 text-blue-400 flex items-center justify-center font-bold text-[9px] animate-pulse">
                          •
                        </div>
                        <span className="font-semibold text-gray-200">DEP Reviewed</span>
                        <span className="text-[8px] text-gray-500">By: Operator (Draft)</span>
                      </div>

                      {/* Step 4: DEP Approved */}
                      <div className="flex flex-col items-center text-center space-y-1.5 z-10 w-24">
                        <div className="w-5 h-5 rounded-full bg-gray-900 border border-gray-800 text-gray-600 flex items-center justify-center font-bold text-[9px]">
                          -
                        </div>
                        <span className="font-semibold text-gray-500">DEP Approved</span>
                        <span className="text-[8px] text-gray-600">Pending Board</span>
                      </div>

                      {/* Step 5: DEP Exported */}
                      <div className="flex flex-col items-center text-center space-y-1.5 z-10 w-24">
                        <div className="w-5 h-5 rounded-full bg-gray-900 border border-gray-800 text-gray-600 flex items-center justify-center font-bold text-[9px]">
                          -
                        </div>
                        <span className="font-semibold text-gray-500">DEP Exported</span>
                        <span className="text-[8px] text-gray-600">Pending Export</span>
                      </div>
                    </div>
                  </div>

                  {/* Sufficiency Details */}
                  {previewDep.evidenceSufficiency === 'fail' && (
                    <div className="bg-red-950/20 border border-red-900/40 p-3 rounded flex gap-3 text-red-400">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">EVIDENCE SUFFICIENCY CHECKS FAILED</div>
                        <p className="text-[10px] text-gray-400 pt-0.5">Missing governance or evaluation records required by standard boards:</p>
                        <ul className="list-disc list-inside text-[10px] text-red-400/90 pt-1 space-y-0.5">
                          {previewDep.evidenceSufficiencyDetails?.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Split Screen Inspector: Left - Point Matrix, Right - Info Panels */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    
                    {/* Point matrix breakdown */}
                    <div className="bg-[#111827]/40 p-4 border border-gray-800 rounded-lg space-y-3">
                      <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                        <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Deterministic Risk Matrix</span>
                        <span className="text-[9px] text-gray-500">Threshold-based engine</span>
                      </div>

                      <div className="space-y-2">
                        {/* Render risk items */}
                        {(() => {
                          const rData = getSectionContent(previewDep, 'risk-assessment') || {};
                          const breakdown = rData.breakdown || {};
                          const breakdownKeys = Object.keys(breakdown);

                          if (breakdownKeys.length === 0) {
                            return <div className="text-gray-500 text-[10px] py-1 text-center">No risk scoring points detected. Zero violations.</div>;
                          }

                          return breakdownKeys.map(k => (
                            <div key={k} className="flex justify-between items-center p-2 bg-[#0B0F14] border border-gray-850 rounded">
                              <span className="text-gray-400">{k}</span>
                              <strong className="text-red-400">+{breakdown[k]} PTS</strong>
                            </div>
                          ));
                        })()}

                        <div className="flex justify-between items-center border-t border-gray-900 pt-3">
                          <span className="font-bold text-gray-300">COMPUTED TOTAL</span>
                          <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                            getSectionContent(previewDep, 'risk-assessment')?.riskLevel === 'CRITICAL'
                              ? 'bg-red-950 text-red-400 border border-red-900/40'
                              : getSectionContent(previewDep, 'risk-assessment')?.riskLevel === 'HIGH'
                                ? 'bg-amber-950 text-amber-500 border border-amber-900/40'
                                : 'bg-green-950 text-green-400 border border-green-900/40'
                          }`}>
                            {getSectionContent(previewDep, 'risk-assessment')?.riskPoints || 0} PTS ({getSectionContent(previewDep, 'risk-assessment')?.riskLevel})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Metadata details */}
                    <div className="bg-[#111827]/40 p-4 border border-gray-800 rounded-lg space-y-3">
                      <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                        <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px]">Frozen Compliance Anchors</span>
                        <span className="text-[9px] text-gray-500">Hash and seals</span>
                      </div>

                      <div className="space-y-2 text-[10.5px] leading-relaxed text-gray-400">
                        <div>
                          <span className="text-gray-500 block text-[9px] font-bold uppercase">Evidence Snapshot Hash</span>
                          <code className="text-gray-300 block bg-[#0B0F14] px-2 py-1 rounded truncate select-all">{previewDep.evidenceSnapshotHash}</code>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[9px] font-bold uppercase">Linked Snapshot ID</span>
                          <code className="text-gray-300 block bg-[#0B0F14] px-2 py-1 rounded truncate">
                            {getSectionContent(previewDep, 'snapshot-evidence')?.snapshotId || 'N/A'}
                          </code>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[9px] font-bold uppercase">Sign off authority</span>
                          <span className="text-gray-300 block bg-[#0B0F14] px-2 py-1 rounded">Release Board (Authority Role)</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* 10 layers verification list */}
                  <div className="space-y-2">
                    <span className="font-bold text-gray-500 uppercase tracking-wider text-[9px] block">Compiled Evidence Layers ({previewDep.evidence.length})</span>
                    <div className="border border-gray-850 rounded overflow-hidden divide-y divide-gray-850">
                      {previewDep.evidence.map((layer, index) => (
                        <details key={layer.layerId} className="group bg-[#111827]/10">
                          <summary className="p-3 font-bold hover:bg-[#111827]/30 transition-all cursor-pointer flex justify-between items-center select-none">
                            <span className="text-gray-300">Layer {index + 1}: {layer.title}</span>
                            <span className="text-blue-400 text-[10px] group-open:rotate-180 transition-all">▼</span>
                          </summary>
                          <div className="p-3 bg-gray-950/40 border-t border-gray-850 text-gray-400 space-y-2 font-mono leading-relaxed select-text">
                            <p className="text-[10px] text-gray-500 font-semibold">{layer.description}</p>
                            <pre className="text-[10px] text-blue-300 overflow-x-auto p-2 bg-[#0B0F14] rounded border border-gray-900 max-h-48">
                              {JSON.stringify(layer.content, null, 2)}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>

          </div>
        )}

        {/* REGISTRY / ARCHIVE TAB */}
        {activeTab === 'archive' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {decisionEvidenceList.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 p-8 space-y-3 bg-[#111827]/10 border border-gray-850 rounded-lg">
                <FileText className="w-12 h-12 text-gray-700" />
                <div>
                  <h3 className="font-bold text-gray-400">Signed Compliance Registry Empty</h3>
                  <p className="max-w-md text-[11px] text-gray-600 leading-relaxed pt-1">
                    No finalized Decision Evidence Packages (DEP) detected in the local workspace archive directories.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-5xl">
                {decisionEvidenceList.map(dep => {
                  const verifiedResult = verificationResults[dep.id];
                  const verifying = isVerifying[dep.id];



                  return (
                    <div key={dep.id} className="bg-[#111827]/30 border border-gray-800 rounded-lg p-4 space-y-4">
                      
                      {/* DEP Metadata Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-900 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-200">{dep.id}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                              dep.decisionType === 'approve'
                                ? 'bg-green-950/40 text-green-400 border-green-900/40'
                                : 'bg-red-950/40 text-red-400 border-red-900/40'
                            }`}>
                              {dep.decisionType === 'approve' ? 'APPROVED RELEASE' : 'REJECTED RELEASE'}
                            </span>
                            <span className="bg-[#1F2937] text-gray-400 border border-gray-800 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">
                              {dep.decisionClass}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500">
                            Generated by {dep.generatedBy} at {new Date(dep.generatedAt).toLocaleString()}
                          </p>
                        </div>

                        {/* Export & Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleExportJson(dep.id)}
                            className="bg-[#0B0F14] hover:bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800 rounded px-2.5 py-1 flex items-center gap-1.5 transition-all text-[10px] font-semibold"
                            title="Export package metadata JSON"
                          >
                            <FileJson className="w-3.5 h-3.5" />
                            <span>Export JSON</span>
                          </button>
                          <button
                            onClick={() => handleExportMarkdown(dep.id)}
                            className="bg-[#0B0F14] hover:bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800 rounded px-2.5 py-1 flex items-center gap-1.5 transition-all text-[10px] font-semibold"
                            title="Export markdown compliance report"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Export Markdown</span>
                          </button>
                        </div>
                      </div>

                      {/* Split Info Panel */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-gray-500 block">Board Compliance Rationale</span>
                          <div className="bg-[#0B0F14]/50 border border-gray-850 p-2.5 rounded text-[11px] text-gray-300 italic min-h-[50px] select-text">
                            &ldquo;{dep.decisionRationale || 'No written rationale archived.'}&rdquo;
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-gray-500 block">Override & Exceptions</span>
                          <div className="bg-[#0B0F14]/50 border border-gray-850 p-2.5 rounded text-[11px] text-gray-300 min-h-[50px] select-text">
                            {dep.overrideReason ? (
                              <div className="space-y-1">
                                <span className="text-red-400 font-bold uppercase text-[9px] block">Recommendation Override</span>
                                <p className="leading-relaxed">&ldquo;{dep.overrideReason}&rdquo;</p>
                              </div>
                            ) : (
                              <span className="text-gray-500">No rule overrides applied.</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-bold text-gray-500 block">Board Signatures ({dep.signatures.length})</span>
                          <div className="bg-[#0B0F14]/50 border border-gray-850 p-2.5 rounded text-[10px] space-y-1 select-text">
                            {dep.signatures.map((sig, idx) => (
                              <div key={idx} className="flex flex-col border-b border-gray-900/60 pb-1 last:border-b-0 last:pb-0 text-gray-400 leading-relaxed">
                                <span className="text-gray-300 font-semibold">{sig.authority}</span>
                                <span className="text-[9px] text-gray-500">Signed: {new Date(sig.timestamp).toLocaleString()}</span>
                                <span className="text-[9.5px] text-blue-400/80 truncate">Seal: {sig.hash}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Horizontal progression graph for signed DEP */}
                      <div className="bg-[#0B0F14] border border-gray-850 p-3 rounded-lg space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">DEP Chain of Custody Timeline</span>
                          <span className="text-[9.5px] text-gray-400">Owner: Release Board</span>
                        </div>
                        <div className="flex justify-between items-center font-mono text-[9.5px] py-1 border-t border-gray-900 overflow-x-auto gap-2">
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-green-400 font-bold">✓</span>
                            <span className="text-gray-300">Created:</span>
                            <span className="text-gray-500">{dep.createdAt ? new Date(dep.createdAt).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <ArrowRight className="w-3 h-3 text-gray-700 shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-green-400 font-bold">✓</span>
                            <span className="text-gray-300">Generated:</span>
                            <span className="text-gray-500">{dep.generatedAt ? new Date(dep.generatedAt).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <ArrowRight className="w-3 h-3 text-gray-700 shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-green-400 font-bold">✓</span>
                            <span className="text-gray-300">Reviewed:</span>
                            <span className="text-gray-500">{dep.reviewedAt ? new Date(dep.reviewedAt).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <ArrowRight className="w-3 h-3 text-gray-700 shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-green-400 font-bold">✓</span>
                            <span className="text-gray-300">Approved:</span>
                            <span className="text-green-400 font-semibold">{dep.approvedAt ? new Date(dep.approvedAt).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <ArrowRight className="w-3 h-3 text-gray-700 shrink-0" />
                          <div className="flex items-center gap-1 shrink-0">
                            {dep.exportedAt ? (
                              <>
                                <span className="text-green-400 font-bold">✓</span>
                                <span className="text-gray-300">Exported:</span>
                                <span className="text-green-400">{new Date(dep.exportedAt).toLocaleDateString()}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-gray-600 font-bold">•</span>
                                <span className="text-gray-500">Export:</span>
                                <span className="text-gray-600">Pending</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Integrity Verification controls */}
                      <div className="bg-[#0B0F14]/20 border border-gray-850 rounded p-2.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleVerify(dep.id)}
                            disabled={verifying}
                            className="bg-[#0B0F14] hover:bg-gray-900 border border-gray-800 text-gray-300 px-3 py-1 rounded font-bold text-[10px] flex items-center gap-1.5 transition-all"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
                            <span>Verify Package Integrity</span>
                          </button>

                          {verifiedResult && (
                            <div className="flex items-center gap-3 text-[10px] select-text">
                              <div className="flex items-center gap-1">
                                <span className={verifiedResult.hashValid ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                  {verifiedResult.hashValid ? '✓' : '✗'}
                                </span>
                                <span className="text-gray-500">Hash Seal</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={verifiedResult.signatureValid ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                  {verifiedResult.signatureValid ? '✓' : '✗'}
                                </span>
                                <span className="text-gray-500">Board Signature</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={verifiedResult.rcExists ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                  {verifiedResult.rcExists ? '✓' : '✗'}
                                </span>
                                <span className="text-gray-500">Candidate Ref</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={verifiedResult.snapshotExists ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                  {verifiedResult.snapshotExists ? '✓' : '✗'}
                                </span>
                                <span className="text-gray-500">Snapshot Ref</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={verifiedResult.provenanceExists ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                  {verifiedResult.provenanceExists ? '✓' : '✗'}
                                </span>
                                <span className="text-gray-500">Provenance Ledger Ref</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {verifiedResult && (
                          <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            verifiedResult.integrityStatus === 'verified'
                              ? 'bg-green-950/40 text-green-400 border border-green-900/40'
                              : 'bg-red-950/40 text-red-400 border border-red-900/40 animate-pulse'
                          }`}>
                            {verifiedResult.integrityStatus}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};
export default DecisionEvidenceView;
