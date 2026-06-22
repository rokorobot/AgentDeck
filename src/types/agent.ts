export type AgentTool = "terminal" | "browser" | "files" | "git" | "logs";

export interface AgentModelBinding {
  provider: string; // e.g. "gemini", "openai", "anthropic", "ollama", "custom"
  model: string;    // e.g. "gemini-1.5-pro", "gpt-4o", etc.
  reasoningLevel?: string; // "high", "medium", "low"
  temperature?: number;
}

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  status: "idle" | "active" | "paused" | "error";
  modelBinding: AgentModelBinding;
  tools: AgentTool[];
  createdAt: string;
}

export interface AgentSession {
  id: string;
  agentId: string;
  workspaceId: string;
  modelSnapshot: AgentModelBinding;
  terminalId?: string;
  browserUrl?: string;
  status: "starting" | "running" | "stopped" | "failed";
  startedAt: string;
  stoppedAt?: string;
}

export interface AgentWindow {
  id: string;
  sessionId: string;
  workspaceId: string;
  type: "terminal" | "browser" | "logs" | "chat";
  title: string;
  state: "open" | "minimized" | "closed";
}

export type AgentTopologySuggestion = {
  id: string;
  workspaceId: string;
  detectedFrom: string[];
  confidence: "low" | "medium" | "high";
  suggestedAgents: SuggestedAgent[];
  createdAt: string;
};

export type SuggestedAgent = {
  id: string;
  name: string;
  role: string;
  reason: string;
  tools: AgentTool[];
  modelBinding: {
    provider: string;
    model: string;
  };
};

