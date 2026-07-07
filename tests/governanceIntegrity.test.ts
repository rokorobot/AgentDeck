import { describe, it, expect } from 'vitest';
import { runGovernanceIntegrityCheck } from '../src/lib/governanceIntegrity';

// The checker takes 6 collections. This helper builds an all-empty baseline so
// each test can vary exactly one dimension.
function run(overrides: Partial<Parameters<typeof runGovernanceIntegrityCheck>[0]> = {}) {
  return runGovernanceIntegrityCheck({
    policies: null,
    releaseCandidates: [],
    timelineEvents: [],
    benchmarks: [],
    regressionRuns: [],
    promotions: [],
    ...overrides,
  } as any);
}

const validPolicies = { schemaVersion: 'agentdeck.governance.v1', integrityStatus: 'verified' } as any;
const check = (report: ReturnType<typeof runGovernanceIntegrityCheck>, id: string) =>
  report.checks.find((c) => c.id === id);

describe('runGovernanceIntegrityCheck — overall status', () => {
  it('reports error when no policy is loaded', () => {
    const report = run();
    expect(report.status).toBe('error');
    expect(check(report, 'policy_exists')?.status).toBe('fail');
  });

  it('reports healthy for valid signed policies and no records', () => {
    const report = run({ policies: validPolicies });
    expect(report.status).toBe('healthy');
    expect(check(report, 'policy_schema')?.status).toBe('pass');
    expect(check(report, 'policy_integrity')?.status).toBe('pass');
  });

  it('counts passed vs total consistently', () => {
    const report = run({ policies: validPolicies });
    expect(report.passedCount).toBe(report.totalCount);
  });
});

describe('runGovernanceIntegrityCheck — policy integrity', () => {
  it('warns on unsigned (legacy) policies', () => {
    const report = run({ policies: { schemaVersion: 'agentdeck.governance.v1' } as any });
    expect(check(report, 'policy_integrity')?.status).toBe('warning');
    expect(report.status).toBe('warning');
  });

  it('fails on an invalid schema version', () => {
    const report = run({ policies: { schemaVersion: 'bogus', integrityStatus: 'verified' } as any });
    expect(check(report, 'policy_schema')?.status).toBe('fail');
  });
});

describe('runGovernanceIntegrityCheck — release candidate checks', () => {
  const candidate = (o: Record<string, any> = {}) => ({
    id: 'rc-1',
    status: 'approved',
    integrityStatus: 'verified',
    benchmarkId: 'b-1',
    timelineEventId: 'evt-1',
    ...o,
  });
  const supporting = {
    benchmarks: [{ id: 'b-1' }] as any,
    timelineEvents: [{ id: 'evt-1' }] as any,
  };

  it('fails candidate integrity when a record is tampered', () => {
    const report = run({
      policies: validPolicies,
      releaseCandidates: [candidate({ integrityStatus: 'tampered' })] as any,
      ...supporting,
    });
    expect(check(report, 'candidates_integrity')?.status).toBe('fail');
    expect(report.status).toBe('error');
  });

  it('fails lifecycle validation on an invalid status', () => {
    const report = run({
      policies: validPolicies,
      releaseCandidates: [candidate({ status: 'not-a-real-status' })] as any,
      ...supporting,
    });
    expect(check(report, 'candidates_lifecycle')?.status).toBe('fail');
  });

  it('warns on an orphan timeline reference', () => {
    const report = run({
      policies: validPolicies,
      releaseCandidates: [candidate({ timelineEventId: 'missing' })] as any,
      benchmarks: supporting.benchmarks,
      timelineEvents: supporting.timelineEvents,
    });
    expect(check(report, 'candidate_timeline_refs')?.status).toBe('warning');
  });

  it('fails cross-layer audit when the benchmark is missing', () => {
    const report = run({
      policies: validPolicies,
      releaseCandidates: [candidate({ benchmarkId: 'ghost' })] as any,
      timelineEvents: supporting.timelineEvents,
    });
    expect(check(report, 'cross_layer_audit')?.status).toBe('fail');
  });
});

describe('runGovernanceIntegrityCheck — timeline & promotions', () => {
  it('fails timeline integrity on a tampered event', () => {
    const report = run({
      policies: validPolicies,
      timelineEvents: [{ id: 'evt-1', integrityStatus: 'tampered' }] as any,
    });
    expect(check(report, 'timeline_integrity')?.status).toBe('fail');
  });

  it('warns on a promotion referencing a missing benchmark', () => {
    const report = run({
      policies: validPolicies,
      promotions: [{ benchmarkId: 'ghost', runId: 'run-1' }] as any,
      regressionRuns: [{ id: 'run-1' }] as any,
    });
    expect(check(report, 'promotions_benchmark_refs')?.status).toBe('warning');
  });
});
