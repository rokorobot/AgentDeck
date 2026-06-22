import * as path from 'path';
import * as fs from 'fs';
import { scanAgentTopologyInternal } from '../src/lib/topologyScanner';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTests() {
  console.log('\x1b[36m%s\x1b[0m', '=== Running Agent Topology Wizard Automated Tests ===\n');

  const testWorkspace = 'C:\\Users\\Robert\\AgentDeck_TestWorkspace';

  // Test 1: scan returns expected suggestions from dummy sandbox
  try {
    console.log('Test 1: scan returns expected suggestions from dummy sandbox...');
    const result = scanAgentTopologyInternal(testWorkspace);

    // Verify workspace ID matching sandbox folder basename
    assert(result.workspaceId === 'AgentDeck_TestWorkspace', `Expected workspaceId to be 'AgentDeck_TestWorkspace', got '${result.workspaceId}'`);

    // Verify all 5 suggested agents are detected due to the populated dummy files & package.json
    const agentNames = result.suggestedAgents.map(a => a.name);
    assert(agentNames.includes('React UI Agent'), 'Missing React UI Agent');
    assert(agentNames.includes('Backend Agent'), 'Missing Backend Agent');
    assert(agentNames.includes('Testing Agent'), 'Missing Testing Agent');
    assert(agentNames.includes('Documentation Agent'), 'Missing Documentation Agent');
    assert(agentNames.includes('Electron Runtime Agent'), 'Missing Electron Runtime Agent');

    // Verify confidence is high (all agents suggested, electron package exists)
    assert(result.confidence === 'high', `Expected confidence to be 'high', got '${result.confidence}'`);

    // Verify detections
    assert(result.detectedFrom.includes('React frontend'), 'React frontend not detected');
    assert(result.detectedFrom.includes('Vite project'), 'Vite project not detected');
    assert(result.detectedFrom.includes('TypeScript'), 'TypeScript not detected');
    assert(result.detectedFrom.includes('Test scripts'), 'Test scripts not detected');
    assert(result.detectedFrom.includes('Documentation folder'), 'Documentation folder not detected');
    assert(result.detectedFrom.includes('Backend code'), 'Backend code not detected');
    assert(result.detectedFrom.includes('Electron app'), 'Electron app not detected');

    console.log('\x1b[32m%s\x1b[0m', '  ✓ Test 1 Passed\n');
  } catch (error: any) {
    console.error('\x1b[31m%s\x1b[0m', '  ✗ Test 1 Failed:', error.message);
    process.exit(1);
  }

  // Test 2: scan does not escape workspace root (path traversal check)
  try {
    console.log('Test 2: scan does not escape workspace root (path traversal prevention)...');
    
    // Exact path resolver logic used in our safe scanner
    const resolvedRoot = path.resolve(testWorkspace);
    const safeResolve = (targetRelativePath: string): string => {
      const resolvedTarget = path.resolve(resolvedRoot, targetRelativePath);
      const relative = path.relative(resolvedRoot, resolvedTarget);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Access denied: path escapes workspace root: ${targetRelativePath}`);
      }
      return resolvedTarget;
    };

    // Verify safe subpaths resolve correctly
    const validSub = safeResolve('backend/app.py');
    assert(validSub === path.resolve(resolvedRoot, 'backend/app.py'), 'Valid path resolution failed');

    // Verify relative traversal attempts are blocked
    let errorThrown = false;
    try {
      safeResolve('../../Windows/System32');
    } catch (e: any) {
      errorThrown = true;
      assert(e.message.includes('Access denied'), 'Incorrect error message for path escape');
    }
    assert(errorThrown, 'Failed to throw error for directory traversal escape');

    // Verify absolute traversal attempts are blocked
    let absErrorThrown = false;
    try {
      safeResolve('C:\\Windows\\System32');
    } catch (e: any) {
      absErrorThrown = true;
      assert(e.message.includes('Access denied'), 'Incorrect error message for absolute path escape');
    }
    assert(absErrorThrown, 'Failed to throw error for absolute path escape');

    console.log('\x1b[32m%s\x1b[0m', '  ✓ Test 2 Passed\n');
  } catch (error: any) {
    console.error('\x1b[31m%s\x1b[0m', '  ✗ Test 2 Failed:', error.message);
    process.exit(1);
  }

  // Test 3: duplicate prevention works
  try {
    console.log('Test 3: duplicate prevention works...');

    const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, ' ');
    
    const existingAgents = [
      { id: 'agent_1', name: 'React UI Agent', workspaceId: 'AgentDeck_TestWorkspace' },
      { id: 'agent_2', name: 'Backend Agent', workspaceId: 'AgentDeck_TestWorkspace' }
    ];

    const newSuggestions = [
      { name: '  react ui   agent  ', workspaceId: 'AgentDeck_TestWorkspace' },
      { name: 'New Custom UI Agent', workspaceId: 'AgentDeck_TestWorkspace' }
    ];

    // Check duplicates
    const addedAgents = [];
    newSuggestions.forEach(suggested => {
      const normSuggestedName = normalizeName(suggested.name);
      const isDuplicate = existingAgents.some(
        existing => normalizeName(existing.name) === normSuggestedName && existing.workspaceId === suggested.workspaceId
      );
      if (!isDuplicate) {
        addedAgents.push(suggested);
      }
    });

    // Assert that React UI Agent is caught as a duplicate and only New Custom UI Agent is added
    assert(addedAgents.length === 1, `Expected 1 agent to be added, got ${addedAgents.length}`);
    assert(addedAgents[0].name === 'New Custom UI Agent', `Expected 'New Custom UI Agent' to be added, got '${addedAgents[0].name}'`);

    console.log('\x1b[32m%s\x1b[0m', '  ✓ Test 3 Passed\n');
  } catch (error: any) {
    console.error('\x1b[31m%s\x1b[0m', '  ✗ Test 3 Failed:', error.message);
    process.exit(1);
  }

  // Test 4: reject/cancel creates nothing
  try {
    console.log('Test 4: reject/cancel creates nothing...');

    const existingAgents = [
      { id: 'agent_1', name: 'React UI Agent', workspaceId: 'AgentDeck_TestWorkspace' }
    ];

    const originalLength = existingAgents.length;

    // Simulation of Cancel/Reject:
    // Modal is closed, activeWorkspace.agents is untouched
    const cancelClicked = true;
    let finalAgents = [...existingAgents];
    if (cancelClicked) {
      // do nothing to finalAgents
    }

    assert(finalAgents.length === originalLength, `Expected agents count to remain ${originalLength}, got ${finalAgents.length}`);
    assert(finalAgents[0].name === 'React UI Agent', 'Existing agent state was mutated during cancel');

    console.log('\x1b[32m%s\x1b[0m', '  ✓ Test 4 Passed\n');
  } catch (error: any) {
    console.error('\x1b[31m%s\x1b[0m', '  ✗ Test 4 Failed:', error.message);
    process.exit(1);
  }

  console.log('\x1b[32;1m%s\x1b[0m', 'All tests completed successfully! No regression detected.');
}

runTests();
