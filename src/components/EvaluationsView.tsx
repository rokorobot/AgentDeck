import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  TrendingUp, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Plus, 
  Trash2, 
  Play, 
  FileText, 
  ShieldAlert
} from 'lucide-react';
import { FailureCase } from '../types/evals';

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
    isRunningBenchmark,
    runRegressionSet,
    approveRun,
    rejectRun,
    promoteToBaseline,
    saveFailureCase,
    deleteFailureCase,
    createBenchmark
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

  // Selected benchmark for regression trigger
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(benchmarks[0]?.id || '');

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
      id: `fail-${Date.now()}`,
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
      goldStandardsCount: 10
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
            { id: 'failures', label: 'Failure Library', icon: ShieldAlert, badge: failures.length },
            { id: 'definition', label: 'Benchmark Definition', icon: FileText }
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
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold font-mono text-gray-200">Active Quality Benchmarks</h2>
                <p className="text-xs text-gray-500">List of validation suites defined in the current workspace manifest scope.</p>
              </div>
            </div>

            {benchmarks.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                No active benchmarks defined for this workspace. Use the Manifest Editor to set up evals criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {benchmarks.map((b) => (
                  <div key={b.id} className="p-4 rounded border border-gray-800 bg-[#111827]/40 space-y-3 font-mono">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] uppercase text-blue-500 font-bold tracking-wider">Benchmark Spec</span>
                        <h3 className="text-sm font-bold text-gray-300 mt-0.5">{b.name}</h3>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 uppercase">Baseline</span>
                        <div className="text-lg font-bold text-green-400">{b.baselineScore}</div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 font-sans">{b.description || 'No description provided.'}</p>

                    <div className="space-y-1">
                      <span className="text-[9px] uppercase text-gray-500 font-bold">Evaluations Criteria</span>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {b.criteria.map((c, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-gray-900 border border-gray-800 text-[10px] text-gray-400">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 flex justify-between items-center border-t border-gray-900">
                      <span className="text-[10px] text-gray-500">
                        Gold Standards: <strong className="text-gray-400">{b.goldStandardsCount || 10} prompts</strong>
                      </span>

                      <button
                        onClick={() => {
                          setSelectedBenchmarkId(b.id);
                          setActiveSubTab('regression');
                        }}
                        className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-900/40 px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run Suite</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REGRESSION RUNS */}
        {activeSubTab === 'regression' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[#111827]/40 p-4 rounded border border-gray-800">
              <div className="space-y-1">
                <h2 className="text-sm font-bold font-mono text-gray-200">Regression Run Pipeline</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-mono">Select target benchmark:</span>
                  <select
                    value={selectedBenchmarkId}
                    onChange={(e) => setSelectedBenchmarkId(e.target.value)}
                    className="bg-[#0B0F14] border border-gray-800 focus:outline-none text-[11px] font-mono px-2 py-0.5 rounded text-blue-400"
                  >
                    {benchmarks.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleRunRegression}
                  disabled={isRunningBenchmark}
                  className={`px-4 py-1.5 rounded font-mono text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    isRunningBenchmark
                      ? 'bg-gray-800 border-transparent text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600 hover:scale-[1.02]'
                  }`}
                >
                  {isRunningBenchmark ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-t-transparent border-gray-400 rounded-full animate-spin" />
                      <span>EVALUATING...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>RUN REGRESSION SET</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Run Progress Alert simulated */}
            {isRunningBenchmark && (
              <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded flex flex-col gap-2 font-mono text-xs text-blue-400 animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                  <span>[Evaluator] Deploying test prompt instances against local models...</span>
                </div>
                {!evalScript && (
                  <div className="text-[10px] text-gray-500 pl-3 uppercase">
                    SIMULATION FALLBACK IN PROGRESS: DEMO DATA INCOMING
                  </div>
                )}
              </div>
            )}

            {/* Regression list */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-gray-500 font-mono tracking-wider">Run History Log</h3>
              
              {regressionRuns.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded bg-[#111827]/10">
                  No evaluations history recorded yet. Trigger a Regression Set to populate logs.
                </div>
              ) : (
                <div className="space-y-2">
                  {regressionRuns.map((run) => {
                    const isNeg = run.diff < 0;
                    const isPos = run.diff > 0;
                    const diffText = isNeg ? `${run.diff}` : isPos ? `+${run.diff}` : '0.00';
                    const runBenchmark = benchmarks.find(b => b.id === run.benchmarkId);

                    return (
                      <div key={run.id} className="p-3 bg-[#111827]/30 border border-gray-800 rounded flex flex-col md:flex-row justify-between items-start md:items-center gap-3 font-mono text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[9px] rounded font-bold ${
                              run.status === 'pass' 
                                ? 'bg-green-950/40 text-green-400 border border-green-900/40' 
                                : 'bg-red-950/40 text-red-400 border border-red-900/40'
                            }`}>
                              {run.status === 'pass' ? '✓ PASS' : '✗ REGRESSION DETECTED'}
                            </span>
                            
                            {run.isSimulated && (
                              <span className="px-1.5 py-0.2 rounded bg-gray-900 border border-gray-800 text-[8px] text-gray-500 uppercase font-semibold">
                                SIMULATED RUN
                              </span>
                            )}

                            {run.isApproved && (
                              <span className="px-1.5 py-0.2 rounded bg-green-950/20 border border-green-900/30 text-[8px] text-green-400 uppercase font-semibold">
                                APPROVED
                              </span>
                            )}
                          </div>
                          
                          <div className="text-[11px] font-bold text-gray-300">
                            {runBenchmark?.name || run.benchmarkId} &ndash; {run.triggerContext}
                          </div>
                          
                          <div className="text-[10px] text-gray-500">
                            Run ID: {run.id} &bull; Timestamp: {new Date(run.timestamp).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 border-l border-gray-800/80 pl-4 md:border-l-0 md:pl-0">
                          <div className="text-center min-w-[70px]">
                            <span className="block text-[9px] text-gray-500 uppercase">Baseline</span>
                            <span className="text-gray-400 font-bold">{run.baselineScore}</span>
                          </div>
                          <div className="text-center min-w-[70px]">
                            <span className="block text-[9px] text-gray-500 uppercase">Current</span>
                            <span className={`font-bold ${run.status === 'pass' ? 'text-green-400' : 'text-red-400'}`}>{run.score}</span>
                          </div>
                          <div className="text-center min-w-[70px]">
                            <span className="block text-[9px] text-gray-500 uppercase">Diff</span>
                            <span className={`font-bold ${isNeg ? 'text-red-500' : isPos ? 'text-green-400' : 'text-gray-500'}`}>
                              {diffText}
                            </span>
                          </div>

                          {/* Promotion button if run has a different score but is not promoted yet */}
                          {runBenchmark && runBenchmark.baselineScore !== run.score && (
                            <button
                              onClick={() => promoteToBaseline(run.benchmarkId, run.id)}
                              className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-900/40 px-2 py-0.5 rounded text-[10px] font-bold transition-all"
                              title="Promote this run score to become the new baseline definition target."
                            >
                              Promote Baseline
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: APPROVAL QUEUE */}
        {activeSubTab === 'approvals' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold font-mono text-gray-200 font-bold">Pending Governance Approvals</h2>
              <p className="text-xs text-gray-500">Evaluations with regressions or score drops waiting for developer override/approvals.</p>
            </div>

            {approvalQueue.length === 0 ? (
              <div className="p-8 text-center text-xs text-green-500 border border-dashed border-green-950 rounded bg-green-950/5">
                ✓ No pending evaluations in approval queue. Runtimes conform to baseline expectations.
              </div>
            ) : (
              <div className="space-y-3 font-mono">
                {approvalQueue.map((item) => {
                  const itemBenchmark = benchmarks.find(b => b.id === item.benchmarkId);
                  
                  return (
                    <div key={item.id} className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          <span className="text-[10px] uppercase font-bold text-amber-500">Pending Approval Review</span>
                          <span className="text-[10px] text-gray-500">Submitted: {new Date(item.submittedAt).toLocaleTimeString()}</span>
                        </div>

                        <h3 className="text-sm font-bold text-gray-200">{item.title}</h3>
                        <p className="text-xs text-gray-400 font-sans">
                          A recent run of <strong className="text-gray-300">{itemBenchmark?.name || item.benchmarkId}</strong> detected {item.failuresCount} failures and a score drop. Action required:
                        </p>

                        <div className="flex items-center gap-4 text-xs pt-1.5">
                          <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1 rounded">
                            <span className="text-gray-500">Previous Baseline:</span>{' '}
                            <strong className="text-gray-300">{item.previousScore}</strong>
                          </div>
                          <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1 rounded">
                            <span className="text-gray-500">Current Run Score:</span>{' '}
                            <strong className="text-red-400 font-bold">{item.currentScore}</strong>
                          </div>
                          <div className="bg-[#0B0F14] border border-gray-800 px-3 py-1 rounded">
                            <span className="text-gray-500">Score Decline:</span>{' '}
                            <strong className="text-red-500 font-bold">{parseFloat((item.currentScore - item.previousScore).toFixed(2))}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 self-end md:self-center">
                        <button
                          onClick={() => approveRun(item.id)}
                          className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-all flex items-center gap-1 shadow-md hover:scale-[1.02]"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve Run</span>
                        </button>
                        <button
                          onClick={() => rejectRun(item.id)}
                          className="bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/60 text-xs font-bold px-3 py-1.5 rounded transition-all flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject Run</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: BENCHMARK DEFINITION */}
        {activeSubTab === 'definition' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-900 pb-2">
              <div>
                <h2 className="text-sm font-bold font-mono text-gray-200">Suite Quality Dimensions</h2>
                <p className="text-xs text-gray-500">Configure parameters, weight values, and criteria thresholds for workspace validations.</p>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            className="w-full bg-[#0B0F14] border border-gray-800 px-3 py-1.5 rounded text-gray-400 focus:outline-none"
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
                                  <span className="text-blue-400 font-bold">Equal (25% Weight)</span>
                                </div>
                                <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 w-1/4" />
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
