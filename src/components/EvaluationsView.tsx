import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  TrendingUp, 
  Activity, 
  CheckCircle,
  Plus,
  Trash2,
  ShieldAlert,
  Star,
  Scale,
  History as HistoryIcon
} from 'lucide-react';
import { FailureCase, GoldStandard, JudgeDefinition } from '../types/evals';
import { BenchmarksTab } from './evaluations/BenchmarksTab';
import { RegressionTab } from './evaluations/RegressionTab';
import { ApprovalsTab } from './evaluations/ApprovalsTab';

interface EvaluationsViewProps {
  initialSubTab?: string;
}

export const EvaluationsView: React.FC<EvaluationsViewProps> = ({ initialSubTab = 'benchmarks' }) => {
  const {
    activeWorkspace,
    benchmarks,
    regressionRuns,
    approvalQueue,
    failures,
    goldStandards,
    judges,
    promotions,
    isRunningBenchmark,
    runRegressionSet,
    approveRun,
    rejectRun,
    promoteToBaseline,
    saveFailureCase,
    deleteFailureCase,
    createBenchmark,
    saveGoldStandard,
    deleteGoldStandard,
    saveJudge,
    deleteJudge,
    convertFailureToTestCase
  } = useWorkspaceStore();

  const [activeSubTab, setActiveSubTab] = useState(initialSubTab);
  
  // Benchmark Creation editing state
  const [isAddingBenchmark, setIsAddingBenchmark] = useState(false);
  const [newBenchmarkName, setNewBenchmarkName] = useState('');
  const [newBenchmarkDesc, setNewBenchmarkDesc] = useState('');
  const [newBenchmarkCriteria, setNewBenchmarkCriteria] = useState('');
  const [newBenchmarkBaseline, setNewBenchmarkBaseline] = useState(0.80);
  
  // Failure Library editing state
  const [isAddingFailure, setIsAddingFailure] = useState(false);
  const [newFailurePrompt, setNewFailurePrompt] = useState('');
  const [newFailureExpected, setNewFailureExpected] = useState('');
  const [newFailureActual, setNewFailureActual] = useState('');
  const [newFailureDesc, setNewFailureDesc] = useState('');
  const [newFailureRes, setNewFailureRes] = useState('');

  // Failure Conversion state
  const [convertingFailureId, setConvertingFailureId] = useState<string | null>(null);
  const [conversionSuiteId, setConversionSuiteId] = useState('');
  const [conversionThreshold, setConversionThreshold] = useState(0.80);

  // Gold Standards editing state
  const [isAddingGold, setIsAddingGold] = useState(false);
  const [newGoldTitle, setNewGoldTitle] = useState('');
  const [newGoldContent, setNewGoldContent] = useState('');
  const [newGoldTags, setNewGoldTags] = useState('');
  const [newGoldType, setNewGoldType] = useState<'prompt' | 'output' | 'document' | 'rubric'>('prompt');
  const [newGoldSource, setNewGoldSource] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('');

  // Judges editing state
  const [isAddingJudge, setIsAddingJudge] = useState(false);
  const [newJudgeName, setNewJudgeName] = useState('');
  const [newJudgeCriteria, setNewJudgeCriteria] = useState('');
  const [newJudgeThreshold, setNewJudgeThreshold] = useState(0.80);

  // Selected benchmark for regression trigger
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(benchmarks[0]?.id || '');
  
  // Selected run ID for displaying report details
  const [selectedRunIdForReport, setSelectedRunIdForReport] = useState<string | null>(null);

  React.useEffect(() => {
    if (benchmarks.length > 0) {
      if (!benchmarks.some(b => b.id === selectedBenchmarkId)) {
        setSelectedBenchmarkId(benchmarks[0].id);
      }
    } else {
      setSelectedBenchmarkId('');
    }
  }, [benchmarks, selectedBenchmarkId]);

  const handleRunRegression = async () => {
    const targetId = selectedBenchmarkId || benchmarks[0]?.id;
    if (!targetId) return;
    await runRegressionSet(targetId);
  };

  const handleAddFailureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFailurePrompt.trim() || !newFailureDesc.trim()) return;

    const targetId = selectedBenchmarkId || benchmarks[0]?.id || 'sound-machina-prompt-quality';

    const newFailure: FailureCase = {
      id: `fail-${crypto.randomUUID()}`,
      benchmarkId: targetId,
      prompt: newFailurePrompt,
      expected: newFailureExpected,
      actual: newFailureActual,
      failureDescription: newFailureDesc,
      resolution: newFailureRes || undefined,
      resolved: !!newFailureRes,
      timestamp: new Date().toISOString()
    };

    await saveFailureCase(newFailure);

    // Reset Form
    setNewFailurePrompt('');
    setNewFailureExpected('');
    setNewFailureActual('');
    setNewFailureDesc('');
    setNewFailureRes('');
    setIsAddingFailure(false);
  };

  const handleAddBenchmarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBenchmarkName.trim()) return;

    const id = newBenchmarkName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const criteriaList = newBenchmarkCriteria
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    const newBenchmark = {
      id,
      name: newBenchmarkName,
      description: newBenchmarkDesc,
      criteria: criteriaList.length > 0 ? criteriaList : ['Quality', 'Performance'],
      baselineScore: Number(newBenchmarkBaseline) || 0.80,
      goldStandardsCount: 10,
      testCases: []
    };

    await createBenchmark(newBenchmark);

    // Reset Form
    setNewBenchmarkName('');
    setNewBenchmarkDesc('');
    setNewBenchmarkCriteria('');
    setNewBenchmarkBaseline(0.80);
    setIsAddingBenchmark(false);
    setSelectedBenchmarkId(id);
  };

  const handleAddGoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoldTitle.trim() || !newGoldContent.trim()) return;

    const newItem: GoldStandard = {
      id: `gold-${crypto.randomUUID()}`,
      title: newGoldTitle,
      content: newGoldContent,
      tags: newGoldTags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      type: newGoldType,
      source: newGoldSource || 'operator',
      createdAt: new Date().toISOString()
    };

    await saveGoldStandard(newItem);

    // Reset Form
    setNewGoldTitle('');
    setNewGoldContent('');
    setNewGoldTags('');
    setNewGoldType('prompt');
    setNewGoldSource('');
    setIsAddingGold(false);
  };

  const handleAddJudgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJudgeName.trim()) return;

    const id = newJudgeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newJudge: JudgeDefinition = {
      id,
      name: newJudgeName,
      criteria: newJudgeCriteria.split(',').map(c => c.trim()).filter(c => c.length > 0),
      threshold: Number(newJudgeThreshold) || 0.80
    };

    await saveJudge(newJudge);

    // Reset Form
    setNewJudgeName('');
    setNewJudgeCriteria('');
    setNewJudgeThreshold(0.80);
    setIsAddingJudge(false);
  };

  const handlePromoteBaselineClick = async (benchmarkId: string, runId: string) => {
    const reason = window.prompt("Enter the reason for promoting this baseline score:", "Optimized model parameters and system prompt constraints.");
    if (reason === null) return; // Cancelled
    await promoteToBaseline(benchmarkId, runId, reason);
  };

  // Check if evaluation script is configured in active workspace
  const evalScript = (activeWorkspace as any)?.evals?.script;
  const evalThreshold = (activeWorkspace as any)?.evals?.baselineThreshold || 0.8;

  return (
    <div className="flex flex-col h-full bg-[#0B0F14] text-[#E5E7EB] font-sans rounded overflow-hidden border border-[#1F2937]">
      {/* Tab Row */}
      <div className="bg-[#111827] border-b border-[#1F2937] px-4 flex items-center justify-between shrink-0">
        <div className="flex gap-4">
          {[
            { id: 'benchmarks', label: 'Benchmarks', icon: TrendingUp },
            { id: 'regression', label: 'Regression Runs', icon: Activity },
            { id: 'approvals', label: 'Approval Queue', icon: CheckCircle, badge: approvalQueue.length },
            { id: 'failures', label: 'Failure Library', icon: ShieldAlert, badge: failures.filter(f => !f.resolved).length },
            { id: 'gold_standards', label: 'Gold Standards', icon: Star, badge: goldStandards.length },
            { id: 'judges_definition', label: 'Judges & Definition', icon: Scale },
            { id: 'promotions_history', label: 'Promotion History', icon: HistoryIcon }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-3 border-b-2 font-medium text-xs font-mono transition-all ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-950/10'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {!!tab.badge && (
                  <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-sans font-bold ${
                    tab.id === 'approvals' ? 'bg-amber-600 text-white' : 'bg-red-950 text-red-400 border border-red-900/60'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Global Script config info tag */}
        <div className="flex items-center gap-2 font-mono text-[10px] text-gray-500 bg-[#0B0F14] px-2.5 py-1 rounded border border-[#1F2937]">
          <span>Evals Env:</span>
          {evalScript ? (
            <span className="text-green-400 font-bold uppercase">SCRIPT ACTIVE</span>
          ) : (
            <span className="text-amber-500 font-bold uppercase" title="Demo data will fluctuate visually">SIMULATED FALLBACK</span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0 bg-[#0B0F14]/40">
        
        {/* TAB 1: BENCHMARKS */}
        {activeSubTab === 'benchmarks' && (
          <BenchmarksTab
            benchmarks={benchmarks}
            onRunSuite={(id) => {
              setSelectedBenchmarkId(id);
              setActiveSubTab('regression');
            }}
          />
        )}

        {/* TAB 2: REGRESSION RUNS */}
        {activeSubTab === 'regression' && (
          <RegressionTab
            benchmarks={benchmarks}
            regressionRuns={regressionRuns}
            isRunningBenchmark={isRunningBenchmark}
            evalScript={evalScript}
            selectedBenchmarkId={selectedBenchmarkId}
            selectedRunIdForReport={selectedRunIdForReport}
            onSelectBenchmark={setSelectedBenchmarkId}
            onRunRegression={handleRunRegression}
            onPromoteBaseline={handlePromoteBaselineClick}
            onToggleReport={(runId) => setSelectedRunIdForReport(selectedRunIdForReport === runId ? null : runId)}
          />
        )}

        {/* TAB 3: APPROVAL QUEUE */}
        {activeSubTab === 'approvals' && (
          <ApprovalsTab
            approvalQueue={approvalQueue}
            benchmarks={benchmarks}
            onApprove={approveRun}
            onReject={rejectRun}
          />
        )}

        {/* TAB 4: FAILURE LIBRARY */}
        {activeSubTab === 'failures' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-900 pb-2">
              <div>
                <h2 className="text-sm font-bold font-mono text-gray-200">Failure Case Library</h2>
                <p className="text-xs text-gray-500">Historical database of validation faults and prompt failures used to enforce regression thresholds.</p>
              </div>
              
              <button
                onClick={() => setIsAddingFailure(!isAddingFailure)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingFailure ? 'Cancel Form' : 'Register Failure'}</span>
              </button>
            </div>

            {/* Add Failure Form */}
            {isAddingFailure && (
              <form onSubmit={handleAddFailureSubmit} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
                <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
                  Manual Failure Registration
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Input Prompt</label>
                    <input
                      type="text"
                      required
                      value={newFailurePrompt}
                      onChange={(e) => setNewFailurePrompt(e.target.value)}
                      placeholder="e.g. Coldwave track prompt..."
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Failure Description</label>
                    <input
                      type="text"
                      required
                      value={newFailureDesc}
                      onChange={(e) => setNewFailureDesc(e.target.value)}
                      placeholder="e.g. Output contains trance synths..."
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Expected Output Description</label>
                    <textarea
                      value={newFailureExpected}
                      onChange={(e) => setNewFailureExpected(e.target.value)}
                      rows={2}
                      placeholder="What should the gold standard model output be?"
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Actual Faulty Output</label>
                    <textarea
                      value={newFailureActual}
                      onChange={(e) => setNewFailureActual(e.target.value)}
                      rows={2}
                      placeholder="What did the faulty engine generate?"
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-gray-500 uppercase text-[9px] font-bold">Resolution constraints added (Resolution Notes)</label>
                  <input
                    type="text"
                    value={newFailureRes}
                    onChange={(e) => setNewFailureRes(e.target.value)}
                    placeholder="e.g. Added genre bounds to System Prompts"
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
                >
                  Save Failure Case
                </button>
              </form>
            )}

            {failures.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                No failure logs registered in the database.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 font-mono text-xs">
                {failures.map((f) => (
                  <div key={f.id} className="p-4 bg-[#111827]/30 border border-gray-800 rounded space-y-3 relative group">
                    <button
                      onClick={() => deleteFailureCase(f.id)}
                      className="absolute top-4 right-4 text-gray-600 hover:text-red-400 transition-colors p-1"
                      title="Delete Failure Case"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[9px] rounded font-bold ${
                        f.resolved 
                          ? 'bg-green-950/40 text-green-400 border border-green-900/40' 
                          : 'bg-red-950/40 text-red-400 border border-red-900/40'
                      }`}>
                        {f.resolved ? 'RESOLVED' : 'UNRESOLVED FAULT'}
                      </span>
                      <span className="text-[10px] text-gray-500">Case ID: {f.id} &bull; Stored: {new Date(f.timestamp).toLocaleString()}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Input Prompt</div>
                      <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1.5 rounded text-gray-300 italic">
                        "{f.prompt}"
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                      <div className="p-2 bg-[#0B0F14]/60 border border-gray-800 rounded space-y-1">
                        <span className="text-red-400 font-bold block text-[9px] uppercase">Actual (Faulty Output)</span>
                        <p className="text-gray-400 italic">"{f.actual || 'N/A'}"</p>
                        <div className="text-[10px] text-red-300 font-bold pt-1">
                          Fault: {f.failureDescription}
                        </div>
                      </div>

                      <div className="p-2 bg-[#0B0F14]/60 border border-gray-800 rounded space-y-1">
                        <span className="text-green-400 font-bold block text-[9px] uppercase">Expected (Gold Standard)</span>
                        <p className="text-gray-400 italic">"{f.expected || 'N/A'}"</p>
                      </div>
                    </div>

                    {f.resolution && (
                      <div className="p-2 bg-green-950/5 border border-green-900/20 rounded">
                        <div className="text-green-400 font-bold text-[9px] uppercase">Resolution Constraint</div>
                        <div className="text-gray-300 pt-0.5">{f.resolution}</div>
                      </div>
                    )}

                    {f.converted ? (
                      <div className="p-2 bg-green-950/15 border border-green-900/30 text-green-400 rounded flex items-center gap-1.5 mt-2">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Converted to Benchmark test case in <strong className="font-bold">{f.convertedToBenchmarkId}</strong> (Case ID: {f.convertedToTestCaseId?.slice(-6)})
                        </span>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-gray-900 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-500 font-mono">Continuous Improvement:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setConvertingFailureId(convertingFailureId === f.id ? null : f.id);
                              setConversionSuiteId(benchmarks[0]?.id || '');
                            }}
                            className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2 py-0.5 rounded text-[10px] font-bold transition-all"
                          >
                            {convertingFailureId === f.id ? 'Cancel Conversion' : 'Convert to Benchmark'}
                          </button>
                        </div>

                        {convertingFailureId === f.id && (
                          <form 
                            onSubmit={async (e) => {
                              e.preventDefault();
                              await convertFailureToTestCase(f.id, conversionSuiteId, Number(conversionThreshold));
                              setConvertingFailureId(null);
                            }}
                            className="p-3 bg-[#0B0F14] border border-gray-800 rounded space-y-2 mt-1 text-[11px]"
                          >
                            <div className="text-[10px] text-blue-400 uppercase font-bold tracking-wider">Failure &rarr; Test Spec Conversion</div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-gray-500 uppercase text-[9px] font-bold block">Target Benchmark Suite</label>
                                <select
                                  value={conversionSuiteId}
                                  onChange={(e) => setConversionSuiteId(e.target.value)}
                                  className="w-full bg-[#111827] border border-gray-800 text-[11px] p-1 text-gray-300 rounded focus:outline-none focus:border-blue-500"
                                >
                                  {benchmarks.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-gray-500 uppercase text-[9px] font-bold block">Evaluation Pass Threshold</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="1"
                                  required
                                  value={conversionThreshold}
                                  onChange={(e) => setConversionThreshold(parseFloat(e.target.value))}
                                  className="w-full bg-[#111827] border border-gray-800 text-[11px] p-1 text-gray-300 rounded focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            </div>

                            <button
                              type="submit"
                              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 font-bold text-[10px] transition-all"
                            >
                              Confirm Permanent Test Conversion
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: JUDGES & DEFINITIONS */}
        {activeSubTab === 'judges_definition' && (
          <div className="space-y-6">
            {/* Split Grid: Suite Dimensions vs Judges List */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* Left Side: Benchmark Suite configs */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                  <div>
                    <h2 className="text-sm font-bold font-mono text-gray-200">Suite Quality Dimensions</h2>
                    <p className="text-xs text-gray-500">Configure parameters, criteria sliders, and gold standard baselines.</p>
                  </div>
                  
                  <button
                    onClick={() => setIsAddingBenchmark(!isAddingBenchmark)}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingBenchmark ? 'Cancel Form' : 'Create Benchmark'}</span>
                  </button>
                </div>

                {/* Add Benchmark Form */}
                {isAddingBenchmark && (
                  <form onSubmit={handleAddBenchmarkSubmit} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
                    <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
                      New Benchmark Spec Definition
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-gray-500 uppercase text-[9px] font-bold">Benchmark Suite Name</label>
                        <input
                          type="text"
                          required
                          value={newBenchmarkName}
                          onChange={(e) => setNewBenchmarkName(e.target.value)}
                          placeholder="e.g. Sound Machina Prompt Quality"
                          className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-500 uppercase text-[9px] font-bold">Baseline Target Score</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          required
                          value={newBenchmarkBaseline}
                          onChange={(e) => setNewBenchmarkBaseline(parseFloat(e.target.value))}
                          placeholder="e.g. 0.85"
                          className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-gray-500 uppercase text-[9px] font-bold">Suite Description</label>
                      <textarea
                        value={newBenchmarkDesc}
                        onChange={(e) => setNewBenchmarkDesc(e.target.value)}
                        rows={2}
                        placeholder="Describe the quality goals of this validation suite..."
                        className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-gray-500 uppercase text-[9px] font-bold">Evaluation Criteria Dimensions (comma-separated)</label>
                      <input
                        type="text"
                        value={newBenchmarkCriteria}
                        onChange={(e) => setNewBenchmarkCriteria(e.target.value)}
                        placeholder="e.g. Melodic structure, Genre consistency, Production usability"
                        className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                      />
                      <p className="text-[10px] text-gray-500">Provide comma-separated dimensions to score outputs against.</p>
                    </div>

                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
                    >
                      Create Benchmark Spec
                    </button>
                  </form>
                )}

                {benchmarks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                    No active benchmarks defined to edit.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {benchmarks.map((b) => (
                      <div key={b.id} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-4 font-mono text-xs">
                        <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                          <div className="font-bold text-gray-300 text-sm">{b.name}</div>
                          <span className="text-[10px] text-gray-500 uppercase">Config Spec</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-gray-500 uppercase text-[9px] font-bold">Suite ID</label>
                              <input
                                type="text"
                                disabled
                                value={b.id}
                                className="w-full bg-[#0B0F14] border border-gray-800 px-3 py-1.5 rounded text-gray-500 cursor-not-allowed"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-gray-500 uppercase text-[9px] font-bold">Description</label>
                              <textarea
                                disabled
                                value={b.description || ''}
                                rows={3}
                                className="w-full bg-[#0B0F14] border border-gray-800 px-3 py-1.5 rounded text-gray-400 focus:outline-none cursor-default"
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-2">
                              <label className="text-gray-500 uppercase text-[9px] font-bold block">Weights Allocation (Criteria)</label>
                              <div className="space-y-2">
                                {b.criteria.map((c, i) => (
                                  <div key={i} className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-gray-400">{c}</span>
                                      <span className="text-blue-400 font-bold">Equal ({(100 / b.criteria.length).toFixed(0)}% Weight)</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500" style={{ width: `${100 / b.criteria.length}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                              <div className="space-y-1">
                                <label className="text-gray-500 uppercase text-[9px] font-bold">Baseline Target</label>
                                <div className="text-sm font-bold text-green-400 bg-gray-900 border border-gray-800 py-1.5 px-3 rounded text-center">
                                  {b.baselineScore}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-gray-500 uppercase text-[9px] font-bold">Failure Threshold</label>
                                <div className="text-sm font-bold text-amber-500 bg-gray-900 border border-gray-800 py-1.5 px-3 rounded text-center">
                                  {evalThreshold}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Test Cases List */}
                        {b.testCases && b.testCases.length > 0 && (
                          <div className="pt-3 border-t border-gray-900 space-y-2">
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Benchmark Test Cases ({b.testCases.length})</span>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {b.testCases.map((tc) => (
                                <div key={tc.id} className="p-2.5 bg-gray-950/60 border border-gray-900 rounded flex flex-col gap-1 text-[11px]">
                                  <div className="flex justify-between items-center">
                                    <span className="text-blue-400 font-bold">Prompt Case</span>
                                    <span className="text-gray-500 text-[10px]">Threshold: <strong className="text-gray-400">{tc.threshold}</strong></span>
                                  </div>
                                  <p className="text-gray-300 italic">"{tc.prompt}"</p>
                                  <div className="text-[10px] text-gray-500 pt-0.5">
                                    <span className="text-green-500">Expected:</span> {tc.expected}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Side: Judges definition */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                  <div>
                    <h2 className="text-sm font-bold font-mono text-gray-200">Evaluations Judges</h2>
                    <p className="text-xs text-gray-500">Define judge instances, scoring rubrics, and acceptance thresholds.</p>
                  </div>
                  
                  <button
                    onClick={() => setIsAddingJudge(!isAddingJudge)}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingJudge ? 'Cancel Form' : 'Add Judge'}</span>
                  </button>
                </div>

                {/* Add Judge Form */}
                {isAddingJudge && (
                  <form onSubmit={handleAddJudgeSubmit} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
                    <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
                      Add New Evaluation Judge
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-gray-500 uppercase text-[9px] font-bold">Judge Name</label>
                        <input
                          type="text"
                          required
                          value={newJudgeName}
                          onChange={(e) => setNewJudgeName(e.target.value)}
                          placeholder="e.g. SunoPromptJudge"
                          className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-500 uppercase text-[9px] font-bold">Acceptance Threshold</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          required
                          value={newJudgeThreshold}
                          onChange={(e) => setNewJudgeThreshold(parseFloat(e.target.value))}
                          placeholder="e.g. 0.80"
                          className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-gray-500 uppercase text-[9px] font-bold">Judge Criteria Dimensions (comma-separated)</label>
                      <input
                        type="text"
                        required
                        value={newJudgeCriteria}
                        onChange={(e) => setNewJudgeCriteria(e.target.value)}
                        placeholder="e.g. musical specificity, genre consistency, clarity"
                        className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                      />
                      <p className="text-[10px] text-gray-500">Criteria weights will be split equally among these items.</p>
                    </div>

                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
                    >
                      Save Judge Definition
                    </button>
                  </form>
                )}

                {/* Judges list */}
                <div className="grid grid-cols-1 gap-3 font-mono text-xs">
                  {judges.map((j) => (
                    <div key={j.id} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 relative group">
                      <button
                        onClick={() => deleteJudge(j.id)}
                        className="absolute top-4 right-4 text-gray-600 hover:text-red-400 transition-colors p-1"
                        title="Delete Judge"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[9px] uppercase text-purple-400 font-bold tracking-wider">Acceptance Evaluator</span>
                          <h3 className="text-sm font-bold text-gray-200 mt-0.5">{j.name}</h3>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-gray-500 uppercase block">Threshold</span>
                          <span className="text-md font-bold text-blue-400">{j.threshold}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Criteria Dimensions</span>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {j.criteria.map((c, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-gray-900 border border-gray-800 text-[10px] text-gray-400">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* TAB 6: GOLD STANDARDS */}
        {activeSubTab === 'gold_standards' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-900 pb-2">
              <div>
                <h2 className="text-sm font-bold font-mono text-gray-200">Gold Standards Reference Library</h2>
                <p className="text-xs text-gray-500">Reference items, standard inputs, and optimal model outputs used for evaluations.</p>
              </div>
              
              <button
                onClick={() => setIsAddingGold(!isAddingGold)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingGold ? 'Cancel Form' : 'Add Gold Standard'}</span>
              </button>
            </div>

            {/* Add Gold Standard Form */}
            {isAddingGold && (
              <form onSubmit={handleAddGoldSubmit} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 font-mono text-xs">
                <div className="font-bold text-gray-300 pb-1 border-b border-gray-900 uppercase text-[10px] tracking-wider text-blue-400">
                  New Gold Standard Definition
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Standard Title</label>
                    <input
                      type="text"
                      required
                      value={newGoldTitle}
                      onChange={(e) => setNewGoldTitle(e.target.value)}
                      placeholder="e.g. Best Suno Prompt"
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Content Type</label>
                    <select
                      value={newGoldType}
                      onChange={(e) => setNewGoldType(e.target.value as any)}
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    >
                      <option value="prompt">Prompt</option>
                      <option value="output">Output</option>
                      <option value="document">Document</option>
                      <option value="rubric">Rubric</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Source Reference (Optional)</label>
                    <input
                      type="text"
                      value={newGoldSource}
                      onChange={(e) => setNewGoldSource(e.target.value)}
                      placeholder="e.g. lead-designer, sound-architect"
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-500 uppercase text-[9px] font-bold">Tags (comma-separated)</label>
                    <input
                      type="text"
                      value={newGoldTags}
                      onChange={(e) => setNewGoldTags(e.target.value)}
                      placeholder="e.g. suno, ambient, v1"
                      className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-gray-500 uppercase text-[9px] font-bold">Reference Content / Standard text</label>
                  <textarea
                    required
                    value={newGoldContent}
                    onChange={(e) => setNewGoldContent(e.target.value)}
                    rows={4}
                    placeholder="Enter standard template or optimal music prompt description here..."
                    className="w-full bg-[#0B0F14] border border-gray-800 focus:border-blue-500 focus:outline-none px-2 py-1.5 rounded text-gray-300"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-1.5 font-bold transition-all text-xs"
                >
                  Save Gold Standard Spec
                </button>
              </form>
            )}

            {/* Tags Filters list */}
            {goldStandards.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center font-mono text-[10px] bg-[#111827]/40 p-2.5 rounded border border-gray-900">
                <span className="text-gray-500 uppercase font-bold mr-1">Filter Tags:</span>
                <button
                  onClick={() => setSelectedTagFilter('')}
                  className={`px-2 py-0.5 rounded transition-all border ${!selectedTagFilter ? 'bg-blue-950/40 text-blue-400 border-blue-900/40' : 'bg-gray-950 text-gray-500 border-transparent hover:text-gray-300'}`}
                >
                  ALL
                </button>
                {Array.from(new Set(goldStandards.flatMap(g => g.tags))).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? '' : tag)}
                    className={`px-2 py-0.5 rounded transition-all border ${selectedTagFilter === tag ? 'bg-blue-950/40 text-blue-400 border-blue-900/40' : 'bg-gray-950 text-gray-500 border-transparent hover:text-gray-300'}`}
                  >
                    {tag.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {/* Gold Standards List Grid */}
            {goldStandards.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                No gold standards references stored in library yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                {goldStandards
                  .filter(g => !selectedTagFilter || g.tags.includes(selectedTagFilter))
                  .map((g) => (
                    <div key={g.id} className="p-4 bg-[#111827]/40 border border-gray-800 rounded-lg space-y-3 relative group">
                      <button
                        onClick={() => deleteGoldStandard(g.id)}
                        className="absolute top-4 right-4 text-gray-600 hover:text-red-400 transition-colors p-1"
                        title="Delete Gold Standard Reference"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 rounded bg-blue-950 text-blue-400 border border-blue-900/30 text-[8px] font-bold uppercase">
                            {g.type}
                          </span>
                          <span className="text-[10px] text-gray-500">Source: <strong className="text-gray-400">{g.source}</strong></span>
                        </div>
                        <h3 className="text-sm font-bold text-gray-200">{g.title}</h3>
                      </div>

                      <p className="text-gray-400 bg-gray-950/50 p-2.5 rounded border border-gray-900 italic font-sans max-h-32 overflow-y-auto whitespace-pre-wrap">
                        "{g.content}"
                      </p>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {g.tags.map((t, idx) => (
                          <span key={idx} className="px-1.5 py-0.2 rounded bg-gray-900 border border-gray-850 text-[9px] text-gray-500">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 7: PROMOTION HISTORY */}
        {activeSubTab === 'promotions_history' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold font-mono text-gray-200">Baseline Promotion History Log</h2>
              <p className="text-xs text-gray-500">Audit trail timeline of promoted benchmark baseline score thresholds.</p>
            </div>

            {promotions.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                No baseline promotion events logged.
              </div>
            ) : (
              <div className="space-y-2">
                {promotions.map((p, idx) => (
                  <div key={idx} className="p-3 bg-[#111827]/30 border border-gray-800 rounded font-mono text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                      <span>{new Date(p.timestamp).toLocaleString()}</span>
                      {p.runId && (
                        <span className="bg-gray-900 border border-gray-850 px-1.5 py-0.2 rounded text-blue-400">
                          Source Run: {p.runId.slice(-6)}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-200">{p.benchmarkName}</span>
                      <div className="flex items-center gap-1.5 bg-[#0B0F14] border border-gray-800 px-2 py-0.5 rounded">
                        <span className="text-gray-500">{p.oldScore}</span>
                        <span className="text-gray-500">&rarr;</span>
                        <span className="text-green-400 font-bold">{p.newScore}</span>
                      </div>
                    </div>

                    {p.reason && (
                      <div className="text-[11px] text-gray-400 italic bg-[#0B0F14]/40 p-2 rounded border border-gray-900/60 font-sans">
                        &ldquo;{p.reason}&rdquo;
                      </div>
                    )}

                    <div className="text-[9px] text-gray-500">
                      Governance Approval: <strong className="text-gray-400 uppercase">{p.approvedBy}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
export default EvaluationsView;
