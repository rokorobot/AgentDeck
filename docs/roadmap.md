# AgentDeck Development Roadmap

This document maps out the release timeline, completed milestones, and immediate architectural focus for AgentDeck.

---

## Completed Milestones

### v0.1: Windows App Foundation
- **Focus**: Native desktop environment boots and renders terminal inputs.
- [x] Electron application bootstrap with TSX/tsc pre-compiling.
- [x] React workspace shell layout using custom dark theme.
- [x] Responsive `xterm.js` console panel rendering standard Windows shells.
- [x] Sandboxed browser preview iframe.
- [x] Paste and input safety regex filters.

### v0.2: Probing & Observability
- **Focus**: Context auto-discovery and background status indicators.
- [x] Auto-discovery of folders via directory picking.
- [x] Automated workspace manifest generation (`.agentdeck/workspace.json`).
- [x] Non-blocking health checks (HTTP port polling & Ollama API validation).
- [x] Sidebar metrics badges for quick port/run statuses.

### v0.3: Workspace Runtime Control (Current)
- **Focus**: Process control and diagnostic feedback.
- [x] Process registry separating user interactive shells from managed service scripts.
- [x] Windows process-tree recursive force-killing (`taskkill /F /T /PID`).
- [x] Audit trails for stop and restart routines.
- [x] Self-healing terminal fallbacks recovering ConPTY crashes on the fly.
- [x] Three-tab logs: Safety Logs, Runtime Logs (ANSI stripped), and Process Events.
- [x] Safe IDE launchers (VS Code, Cursor, Explorer) with missing binary logs.

---

## Up Next: v0.4 — Workspace Templates & Service Groups

Instead of jumping straight into AI integrations or configurations, **v0.4 focuses on daily developer ergonomics by introducing workspace templates and command service groups**.

### The Problem
Complex workspaces often require multiple companion services to run concurrently (e.g. starting a frontend requires launching a backend API, a worker thread, and a docker database container). Triggering these individually is tedious.

### The Solution: Service Groups
Introduce the concept of a "Service Group" in the manifest, allowing users to group multiple commands under a single named tab/group.

#### Manifest Additions (Schema Proposal)
```json
{
  "schemaVersion": "agentdeck.workspace.v1.1",
  "templates": {
    "developer-preset": {
      "label": "Full-stack Setup",
      "services": ["start-db", "start-backend", "start-frontend"]
    }
  },
  "commands": [
    {
      "id": "start-db",
      "label": "Database Container",
      "command": "docker-compose up db"
    },
    {
      "id": "start-backend",
      "label": "FastAPI Server",
      "command": "uvicorn main:app --reload"
    },
    {
      "id": "start-frontend",
      "label": "Vite Client",
      "command": "npm run dev"
    }
  ]
}
```

#### v0.4 Key Objectives:
- **One-Click Workspace Boot**: A central `Start Workspace` dashboard button that automatically triggers all services mapped in the active template.
- **Service Dependency Graphing**: Boot services in a defined sequence, waiting for a health check to pass before spawning the next dependent service.
- **Unified Service View**: Group concurrent stdout logs into the Runtime Logs feed, and show process health states in a side-by-side drawer layout.

---

## Future Roadmaps

### v0.5: Local AI Workspace Automation
- **Focus**: Injecting AI capabilities directly into the operator console.
- [ ] Direct Ollama model download and selection menus in the sidebar.
- [ ] Monitored agent execution streams (spawning shell sub-agents to debug terminal errors).
- [ ] Context-aware shell commands helper suggestion box.

### v1.0: Full Workspace Orchestration
- **Focus**: Production environment orchestration and scaling.
- [ ] Team manifest sharing.
- [ ] Remote VPS runtime dashboard (controlling remote services from a local HUD).
- [ ] Plugin extension ecosystem.
