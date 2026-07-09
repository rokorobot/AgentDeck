import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  TrendingUp, 
  Activity, 
  CheckCircle,
  ShieldAlert,
  Star,
  Scale,
  History as HistoryIcon
} from 'lucide-react';
import { FailureCase, GoldStandard, JudgeDefinition } from '../types/evals';
import { BenchmarksTab } from './evaluations/BenchmarksTab';
import { RegressionTab } from './evaluations/RegressionTab';
import { ApprovalsTab } from './evaluations/ApprovalsTab';
import { FailuresTab } from './evaluations/FailuresTab';
import { PromotionHistoryTab } from './evaluations/PromotionHistoryTab';
import { GoldStandardsTab } from './evaluations/GoldStandardsTab';
import { JudgesDefinitionsTab } from './evaluations/JudgesDefinitionsTab';

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

  const handleToggleConvertFailure = (failureId: string) => {
    setConvertingFailureId(convertingFailureId === failureId ? null : failureId);
    setConversionSuiteId(benchmarks[0]?.id || '');
  };

  const handleConvertFailureSubmit = async (e: React.FormEvent, failureId: string) => {
    e.preventDefault();
    await convertFailureToTestCase(failureId, conversionSuiteId, Number(conversionThreshold));
    setConvertingFailureId(null);
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
          <FailuresTab
            failures={failures}
            benchmarks={benchmarks}
            isAddingFailure={isAddingFailure}
            onToggleAddFailure={() => setIsAddingFailure(!isAddingFailure)}
            newFailurePrompt={newFailurePrompt}
            onChangeFailurePrompt={setNewFailurePrompt}
            newFailureExpected={newFailureExpected}
            onChangeFailureExpected={setNewFailureExpected}
            newFailureActual={newFailureActual}
            onChangeFailureActual={setNewFailureActual}
            newFailureDesc={newFailureDesc}
            onChangeFailureDesc={setNewFailureDesc}
            newFailureRes={newFailureRes}
            onChangeFailureRes={setNewFailureRes}
            onSubmitAddFailure={handleAddFailureSubmit}
            convertingFailureId={convertingFailureId}
            conversionSuiteId={conversionSuiteId}
            onChangeConversionSuiteId={setConversionSuiteId}
            conversionThreshold={conversionThreshold}
            onChangeConversionThreshold={setConversionThreshold}
            onToggleConvert={handleToggleConvertFailure}
            onSubmitConversion={handleConvertFailureSubmit}
            onDeleteFailure={deleteFailureCase}
          />
        )}

        {/* TAB 5: JUDGES & DEFINITIONS */}
        {activeSubTab === 'judges_definition' && (
          <JudgesDefinitionsTab
            benchmarks={benchmarks}
            judges={judges}
            evalThreshold={evalThreshold}
            isAddingBenchmark={isAddingBenchmark}
            onToggleAddBenchmark={() => setIsAddingBenchmark(!isAddingBenchmark)}
            newBenchmarkName={newBenchmarkName}
            onChangeBenchmarkName={setNewBenchmarkName}
            newBenchmarkBaseline={newBenchmarkBaseline}
            onChangeBenchmarkBaseline={setNewBenchmarkBaseline}
            newBenchmarkDesc={newBenchmarkDesc}
            onChangeBenchmarkDesc={setNewBenchmarkDesc}
            newBenchmarkCriteria={newBenchmarkCriteria}
            onChangeBenchmarkCriteria={setNewBenchmarkCriteria}
            onSubmitAddBenchmark={handleAddBenchmarkSubmit}
            isAddingJudge={isAddingJudge}
            onToggleAddJudge={() => setIsAddingJudge(!isAddingJudge)}
            newJudgeName={newJudgeName}
            onChangeJudgeName={setNewJudgeName}
            newJudgeThreshold={newJudgeThreshold}
            onChangeJudgeThreshold={setNewJudgeThreshold}
            newJudgeCriteria={newJudgeCriteria}
            onChangeJudgeCriteria={setNewJudgeCriteria}
            onSubmitAddJudge={handleAddJudgeSubmit}
            onDeleteJudge={deleteJudge}
          />
        )}

        {/* TAB 6: GOLD STANDARDS */}
        {activeSubTab === 'gold_standards' && (
          <GoldStandardsTab
            goldStandards={goldStandards}
            isAddingGold={isAddingGold}
            onToggleAddGold={() => setIsAddingGold(!isAddingGold)}
            newGoldTitle={newGoldTitle}
            onChangeGoldTitle={setNewGoldTitle}
            newGoldType={newGoldType}
            onChangeGoldType={setNewGoldType}
            newGoldSource={newGoldSource}
            onChangeGoldSource={setNewGoldSource}
            newGoldTags={newGoldTags}
            onChangeGoldTags={setNewGoldTags}
            newGoldContent={newGoldContent}
            onChangeGoldContent={setNewGoldContent}
            onSubmitAddGold={handleAddGoldSubmit}
            selectedTagFilter={selectedTagFilter}
            onSelectTag={setSelectedTagFilter}
            onDeleteGoldStandard={deleteGoldStandard}
          />
        )}

        {/* TAB 7: PROMOTION HISTORY */}
        {activeSubTab === 'promotions_history' && (
          <PromotionHistoryTab promotions={promotions} />
        )}

      </div>
    </div>
  );
};
export default EvaluationsView;
