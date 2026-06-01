import { resolve } from 'path';
import { readFileSync } from 'fs';
import { ProvenanceRecord } from '../src/types/provenance';

const WORKSPACE_DIR = process.argv[2] || process.cwd();

console.log(`Testing Provenance Engine in: ${WORKSPACE_DIR}`);

try {
  const provenancePath = resolve(WORKSPACE_DIR, '.agentdeck/governance/provenance.json');
  console.log(`Reading from: ${provenancePath}`);
  
  const content = readFileSync(provenancePath, 'utf8');
  const data = JSON.parse(content);
  
  if (!data.records || !Array.isArray(data.records)) {
    throw new Error('Invalid provenance schema: missing records array');
  }
  
  console.log(`Successfully loaded ${data.records.length} provenance records.`);
  
  let validCount = 0;
  let unsignedCount = 0;
  let tamperedCount = 0;
  
  data.records.forEach((record: ProvenanceRecord) => {
    if (record.integrityStatus === 'verified') validCount++;
    else if (record.integrityStatus === 'unsigned') unsignedCount++;
    else if (record.integrityStatus === 'tampered') tamperedCount++;
  });
  
  console.log('\n--- Integrity Report ---');
  console.log(`Verified: ${validCount}`);
  console.log(`Unsigned: ${unsignedCount}`);
  console.log(`Tampered: ${tamperedCount}`);
  console.log('------------------------\n');
  
  if (data.records.length > 0) {
    console.log('Latest Record Sample:');
    const latest = data.records[0];
    console.log(JSON.stringify(
      {
        id: latest.id,
        type: latest.mutationType,
        source: latest.sourceType,
        timestamp: new Date(latest.timestamp).toISOString()
      }, 
      null, 
      2
    ));
  }
  
  console.log('\nTest passed successfully!');
} catch (err: any) {
  if (err.code === 'ENOENT') {
    console.log('No provenance data found. This is expected if no mutations have been recorded yet.');
  } else {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}
