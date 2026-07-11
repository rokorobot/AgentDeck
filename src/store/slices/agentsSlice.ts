import { Agent, AgentSession, AgentWindow, AgentTool, AgentModelBinding } from '../../types/agent';
import type { WorkspaceSliceCreator } from './types';
import type { WorkspaceStore } from '../workspaceStore';

/**
 * Agents domain slice (W6-3 p4 — fourth domain extracted from workspaceStore).
 *
 * Behavior-preserving move of `agentSessions` + `agentWindows` and the five
 * Agents actions out of the monolith. It stays part of the SAME Zustand store:
 * the root store spreads `createAgentsSlice(set, get, store)` into its object
 * literal, so the single shared `(set, get)` closure is preserved.
 *
 * Agents has NO direct IPC of its own. It persists through the core action
 * `get().saveActiveWorkspace(...)`, and its session actions call into the core
 * terminal actions `get().createTerminal(...)` / `get().killTerminal(...)`. Those
 * core actions are NOT moved — they stay in workspaceStore.ts and are invoked
 * here through the shared closure exactly as they were inline. add/update/remove
 * also read+write the core `activeWorkspace` / `workspaces` state via the shared
 * `set` (valid because `set` is typed against the full `WorkspaceStore`). There
 * is no `loadEvalsData()`/`init()` agents hydration, so unlike provenance/DEP this
 * slice introduces NO accepted residual. Action bodies are copied verbatim.
 */
export interface AgentsSlice {
  agentSessions: AgentSession[];
  agentWindows: AgentWindow[];
  addAgent(name: string, role: string, modelBinding: AgentModelBinding, tools: AgentTool[]): Promise<void>;
  updateAgent(agentId: string, patch: Partial<Agent>): Promise<void>;
  removeAgent(agentId: string): Promise<void>;
  startAgentSession(agentId: string): Promise<void>;
  stopAgentSession(sessionId: string): Promise<void>;
}

export const createAgentsSlice: WorkspaceSliceCreator<WorkspaceStore, AgentsSlice> = (set, get) => ({
  agentSessions: [],
  agentWindows: [],

  addAgent: async (name: string, role: string, modelBinding: AgentModelBinding, tools: AgentTool[]) => {
    const { activeWorkspace, workspaces } = get();
    if (!activeWorkspace) return;

    const newAgent: Agent = {
      id: `agent_${crypto.randomUUID()}`,
      workspaceId: activeWorkspace.id,
      name,
      role,
      status: 'idle',
      modelBinding,
      tools,
      createdAt: new Date().toISOString()
    };

    const updatedWorkspace = {
      ...activeWorkspace,
      agents: [...(activeWorkspace.agents || []), newAgent]
    };

    const res = await get().saveActiveWorkspace(updatedWorkspace);
    if (res.success) {
      set({
        activeWorkspace: updatedWorkspace,
        workspaces: workspaces.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w)
      });
      await get().addSystemLog(`Added agent "${name}" to workspace.`, 'success');
    }
  },

  updateAgent: async (agentId: string, patch: Partial<Agent>) => {
    const { activeWorkspace, workspaces } = get();
    if (!activeWorkspace || !activeWorkspace.agents) return;

    const updatedAgents = activeWorkspace.agents.map(a =>
      a.id === agentId ? { ...a, ...patch } as Agent : a
    );

    const updatedWorkspace = {
      ...activeWorkspace,
      agents: updatedAgents
    };

    const res = await get().saveActiveWorkspace(updatedWorkspace);
    if (res.success) {
      set({
        activeWorkspace: updatedWorkspace,
        workspaces: workspaces.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w)
      });
    }
  },

  removeAgent: async (agentId: string) => {
    const { activeWorkspace, workspaces } = get();
    if (!activeWorkspace || !activeWorkspace.agents) return;

    const updatedAgents = activeWorkspace.agents.filter(a => a.id !== agentId);
    const updatedWorkspace = {
      ...activeWorkspace,
      agents: updatedAgents
    };

    const res = await get().saveActiveWorkspace(updatedWorkspace);
    if (res.success) {
      set({
        activeWorkspace: updatedWorkspace,
        workspaces: workspaces.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w)
      });
      await get().addSystemLog(`Removed agent from workspace.`, 'info');
    }
  },

  startAgentSession: async (agentId: string) => {
    const { activeWorkspace } = get();
    if (!activeWorkspace || !activeWorkspace.agents) return;

    const agent = activeWorkspace.agents.find(a => a.id === agentId);
    if (!agent) return;

    const sessionId = `session_${crypto.randomUUID()}`;
    const termName = `${agent.name} Shell`;
    const cwd = activeWorkspace.rootPath || 'C:\\Users\\Robert\\AgentDeck';
    const shell = 'powershell.exe';

    // 1. Create a terminal window
    const termId = await get().createTerminal(termName, shell, cwd);

    // 2. Create the session object
    const newSession: AgentSession = {
      id: sessionId,
      agentId,
      workspaceId: activeWorkspace.id,
      modelSnapshot: { ...agent.modelBinding },
      terminalId: termId,
      status: 'running',
      startedAt: new Date().toISOString()
    };

    // 3. Create the window container definition
    const newWindow: AgentWindow = {
      id: `window_${sessionId}_term`,
      sessionId,
      workspaceId: activeWorkspace.id,
      type: 'terminal',
      title: `${agent.name} Console`,
      state: 'open'
    };

    // Update store state
    set(state => ({
      agentSessions: [...state.agentSessions, newSession],
      agentWindows: [...state.agentWindows, newWindow]
    }));

    // Set agent status to active
    await get().updateAgent(agentId, { status: 'active' });
    await get().addSystemLog(`Started session for agent "${agent.name}".`, 'success');
  },

  stopAgentSession: async (sessionId: string) => {
    const { agentSessions, agentWindows } = get();
    const session = agentSessions.find(s => s.id === sessionId);
    if (!session) return;

    // 1. Kill terminal if it was created
    if (session.terminalId) {
      await get().killTerminal(session.terminalId);
    }

    // 2. Update agent status back to idle
    await get().updateAgent(session.agentId, { status: 'idle' });

    // 3. Update stores
    set({
      agentSessions: agentSessions.filter(s => s.id !== sessionId),
      agentWindows: agentWindows.filter(w => w.sessionId !== sessionId)
    });

    await get().addSystemLog(`Stopped session for agent.`, 'info');
  },
});
