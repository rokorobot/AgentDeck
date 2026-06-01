import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProvenanceRecord } from '../src/types/provenance';

const WORKSPACE_DIR = process.cwd();

// Replicate computeHash from main.ts
function computeHash(obj: any): string {
  if (obj === null || obj === undefined) return '';
  
  const sortObject = (o: any): any => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sortObject);
    return Object.keys(o).sort().reduce((acc: any, key: string) => {
      if (key === 'hash' || key === 'integrityStatus' || key === 'tampered') {
        return acc;
      }
      acc[key] = sortObject(o[key]);
      return acc;
    }, {});
  };
  
  const serialized = JSON.stringify(sortObject(obj));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

async function runSimulation() {
  console.log('--- Simulating 3 UI Flows ---');
  
  const govDir = path.join(WORKSPACE_DIR, '.agentdeck', 'governance');
  if (!fs.existsSync(govDir)) {
    fs.mkdirSync(govDir, { recursive: true });
  }
  const provenancePath = path.join(govDir, 'provenance.json');
  
  // 1. Simulate: Promote candidate -> baseline
  const promoteRecord: ProvenanceRecord = {
    schemaVersion: 'agentdeck.provenance.v1',
    id: 'prov-prom-111',
    timestamp: Date.now() - 100000,
    actor: 'operator',
    mutationType: 'baseline_promoted',
    sourceType: 'timeline_event',
    sourceId: 'evt-prom-001',
    before: { score: 0.82 },
    after: { score: 0.91, reason: 'Promoted release candidate v1.0.3 after robust regression run', runId: 'run-999' }
  };
  promoteRecord.hash = computeHash(promoteRecord);
  promoteRecord.integrityStatus = 'verified';

  // 2. Simulate: Restore snapshot
  const restoreRecord: ProvenanceRecord = {
    schemaVersion: 'agentdeck.provenance.v1',
    id: 'prov-rest-222',
    timestamp: Date.now() - 50000,
    actor: 'operator',
    mutationType: 'snapshot_restored',
    sourceType: 'snapshot',
    sourceId: 'snap-restore-002',
    before: { snapshotId: null },
    after: { snapshotId: 'snap-backup-v1.0.2', description: 'Pre-restore safety backup state' }
  };
  restoreRecord.hash = computeHash(restoreRecord);
  restoreRecord.integrityStatus = 'verified';

  // 3. Simulate: Edit governance policy
  const editPolicyRecord: ProvenanceRecord = {
    schemaVersion: 'agentdeck.provenance.v1',
    id: 'prov-pol-333',
    timestamp: Date.now(),
    actor: 'operator',
    mutationType: 'policy_updated',
    sourceType: 'policy',
    sourceId: 'policy-gov-003',
    before: { minScore: 0.85, requireApproval: true, allowRegression: false },
    after: { minScore: 0.90, requireApproval: true, allowRegression: false }
  };
  editPolicyRecord.hash = computeHash(editPolicyRecord);
  editPolicyRecord.integrityStatus = 'verified';

  const data = {
    records: [editPolicyRecord, restoreRecord, promoteRecord] // Latest first
  };

  fs.writeFileSync(provenancePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Successfully simulated UI flows and updated ${provenancePath}`);
}

runSimulation().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
