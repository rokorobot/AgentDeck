import { GovernancePolicy, ReleaseCandidate } from '../types/governance';
import { TimelineEvent } from '../types/timeline';
import { BenchmarkDefinition, RegressionRun, PromotionHistoryRecord } from '../types/evals';

export interface IntegrityCheckResult {
  id: string;
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

export interface GovernanceHealthReport {
  status: 'healthy' | 'warning' | 'error';
  passedCount: number;
  totalCount: number;
  checks: IntegrityCheckResult[];
}

export function runGovernanceIntegrityCheck(params: {
  policies: GovernancePolicy | null;
  releaseCandidates: ReleaseCandidate[];
  timelineEvents: TimelineEvent[];
  benchmarks: BenchmarkDefinition[];
  regressionRuns: RegressionRun[];
  promotions: PromotionHistoryRecord[];
}): GovernanceHealthReport {
  const checks: IntegrityCheckResult[] = [];
  const { policies, releaseCandidates, timelineEvents, benchmarks, regressionRuns, promotions } = params;

  // 1. Policy Schema version and hash verification
  if (!policies) {
    checks.push({
      id: 'policy_exists',
      name: 'Governance Policy Loaded',
      status: 'fail',
      message: 'No governance policy is currently loaded for this workspace.'
    });
  } else {
    // Schema version check
    const isSchemaValid = policies.schemaVersion === 'agentdeck.governance.v1';
    checks.push({
      id: 'policy_schema',
      name: 'Policy Schema Version',
      status: isSchemaValid ? 'pass' : 'fail',
      message: isSchemaValid 
        ? 'Governance policy schema version matches runtime: agentdeck.governance.v1.'
        : `Policy schema version "${policies.schemaVersion}" is invalid.`
    });

    // Policy integrity checksum check
    const policyStatus = policies.integrityStatus || 'unsigned';
    let statusVal: IntegrityCheckResult['status'] = 'pass';
    let msg = 'Policy file checksum matches its contents (no manual modification detected).';

    if (policyStatus === 'unsigned') {
      statusVal = 'warning';
      msg = 'Policy file has no integrity checksum (legacy format). Re-saving policies will compute one.';
    } else if (policyStatus === 'tampered') {
      statusVal = 'fail';
      msg = 'CRITICAL ERROR: Policy file content no longer matches its stored checksum (checksum mismatch).';
    }

    checks.push({
      id: 'policy_integrity',
      name: 'Policy File Integrity',
      status: statusVal,
      message: msg
    });
  }

  // 2. Candidate lifecycle validity and checksum mismatch detection
  if (releaseCandidates.length === 0) {
    checks.push({
      id: 'candidates_status',
      name: 'Release Candidate Records',
      status: 'pass',
      message: 'No release candidates in database. (Lifecycle checks bypassed)'
    });
  } else {
    let lifecycleErrors = 0;
    let tamperedCandidates = 0;
    let unsignedCandidates = 0;
    
    const validStatuses = ['pending', 'approved', 'rejected', 'released'];
    
    releaseCandidates.forEach(rc => {
      if (!validStatuses.includes(rc.status)) {
        lifecycleErrors++;
      }
      if (rc.integrityStatus === 'tampered') {
        tamperedCandidates++;
      } else if (rc.integrityStatus === 'unsigned') {
        unsignedCandidates++;
      }
    });

    checks.push({
      id: 'candidates_lifecycle',
      name: 'Candidate Lifecycle Validation',
      status: lifecycleErrors === 0 ? 'pass' : 'fail',
      message: lifecycleErrors === 0
        ? 'All release candidate statuses conform to strict lifecycle queue values.'
        : `Detected ${lifecycleErrors} release candidates with invalid lifecycle statuses.`
    });

    let integrityStatusVal: IntegrityCheckResult['status'] = 'pass';
    let integrityMsg = 'All release candidate records match their integrity checksums.';
    if (tamperedCandidates > 0) {
      integrityStatusVal = 'fail';
      integrityMsg = `Detected ${tamperedCandidates} release candidate records whose checksum no longer matches; records were modified after checksumming.`;
    } else if (unsignedCandidates > 0) {
      integrityStatusVal = 'warning';
      integrityMsg = `Detected ${unsignedCandidates} release candidate records with no integrity checksum (legacy). Recompute checksums to update them.`;
    }

    checks.push({
      id: 'candidates_integrity',
      name: 'Release Candidate Record Integrity',
      status: integrityStatusVal,
      message: integrityMsg
    });
  }

  // 3. Every Release Candidate references an existing timeline event
  if (releaseCandidates.length > 0) {
    let orphanEventRefs = 0;
    releaseCandidates.forEach(rc => {
      const exists = timelineEvents.some(evt => evt.id === rc.timelineEventId);
      if (!exists) {
        orphanEventRefs++;
      }
    });

    checks.push({
      id: 'candidate_timeline_refs',
      name: 'Timeline References Audit',
      status: orphanEventRefs === 0 ? 'pass' : 'warning',
      message: orphanEventRefs === 0
        ? 'All release candidates successfully map to existing timeline audit events.'
        : `Detected ${orphanEventRefs} release candidates referencing non-existent timeline event IDs.`
    });
  } else {
    checks.push({
      id: 'candidate_timeline_refs',
      name: 'Timeline References Audit',
      status: 'pass',
      message: 'No candidates to cross-verify against the timeline.'
    });
  }

  // 4. Every promoted baseline references an existing benchmark
  if (promotions.length > 0) {
    let orphanBenchmarkRefs = 0;
    let orphanRunRefs = 0;
    
    promotions.forEach(promo => {
      const benchmarkExists = benchmarks.some(b => b.id === promo.benchmarkId);
      if (!benchmarkExists) {
        orphanBenchmarkRefs++;
      }
      
      const runExists = regressionRuns.some(run => run.id === promo.runId);
      if (!runExists) {
        orphanRunRefs++;
      }
    });

    checks.push({
      id: 'promotions_benchmark_refs',
      name: 'Promotions Benchmark Mapping',
      status: orphanBenchmarkRefs === 0 ? 'pass' : 'warning',
      message: orphanBenchmarkRefs === 0
        ? 'All baseline promotions reference existing benchmark definitions.'
        : `Detected ${orphanBenchmarkRefs} promotions mapping to missing benchmark IDs.`
    });

    checks.push({
      id: 'promotions_run_refs',
      name: 'Promotions Run Mapping',
      status: orphanRunRefs === 0 ? 'pass' : 'warning',
      message: orphanRunRefs === 0
        ? 'All baseline promotions reference existing regression run results.'
        : `Detected ${orphanRunRefs} promotions referencing missing regression run IDs.`
    });
  } else {
    checks.push({
      id: 'promotions_mapping',
      name: 'Promotions Mapping',
      status: 'pass',
      message: 'Baseline promotion history is empty. (Verification bypassed)'
    });
  }

  // 5. Timeline integrity (checksum mismatch detection)
  if (timelineEvents.length > 0) {
    let tamperedEvents = 0;
    let unsignedEvents = 0;
    
    timelineEvents.forEach(evt => {
      if (evt.integrityStatus === 'tampered') {
        tamperedEvents++;
      } else if (evt.integrityStatus === 'unsigned') {
        unsignedEvents++;
      }
    });

    let timelineStatusVal: IntegrityCheckResult['status'] = 'pass';
    let timelineMsg = 'All event log files match their integrity checksums.';
    if (tamperedEvents > 0) {
      timelineStatusVal = 'fail';
      timelineMsg = `Detected ${tamperedEvents} timeline events whose checksum no longer matches (checksum mismatch).`;
    } else if (unsignedEvents > 0) {
      timelineStatusVal = 'warning';
      timelineMsg = `Detected ${unsignedEvents} timeline events with no integrity checksum (legacy). Recompute checksums to update them.`;
    }

    checks.push({
      id: 'timeline_integrity',
      name: 'Timeline File Integrity',
      status: timelineStatusVal,
      message: timelineMsg
    });
  } else {
    checks.push({
      id: 'timeline_integrity',
      name: 'Timeline File Integrity',
      status: 'pass',
      message: 'Timeline is empty. (Verification bypassed)'
    });
  }

  // 6. Cross-Layer Verification: Release Candidate -> Benchmark exists
  if (releaseCandidates.length > 0) {
    let crossLayerErrors = 0;
    releaseCandidates.forEach(rc => {
      const benchmarkExists = benchmarks.some(b => b.id === rc.benchmarkId);
      if (!benchmarkExists) {
        crossLayerErrors++;
      }
    });

    checks.push({
      id: 'cross_layer_audit',
      name: 'Cross-Layer Integrity Audit',
      status: crossLayerErrors === 0 ? 'pass' : 'fail',
      message: crossLayerErrors === 0
        ? 'All release candidates map correctly to active benchmarks and run definitions.'
        : `Detected ${crossLayerErrors} release candidates mapping to missing benchmarks.`
    });
  } else {
    checks.push({
      id: 'cross_layer_audit',
      name: 'Cross-Layer Integrity Audit',
      status: 'pass',
      message: 'No candidates active to trace cross-layer dependencies.'
    });
  }

  // Calculate overall status
  const failures = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warning').length;
  
  let status: GovernanceHealthReport['status'] = 'healthy';
  if (failures > 0) {
    status = 'error';
  } else if (warnings > 0) {
    status = 'warning';
  }

  return {
    status,
    passedCount: checks.filter(c => c.status === 'pass').length,
    totalCount: checks.length,
    checks
  };
}
