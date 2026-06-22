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
