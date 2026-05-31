# Workspace Manifest Specification (v2)

Projects tell AgentDeck how to orchestrate them by exposing a metadata configuration file named `.agentdeck/workspace.json` in their root directory.

If a project directory is added and this configuration file is missing, AgentDeck opens a template initialization wizard to help the user choose a preset schema (Vite, Python FastAPI, Static Web, or Custom) instead of hand-crafting JSON configurations.

---

## Schema Overview

```json
{
  "schemaVersion": "agentdeck.workspace.v2",
  "id": "my-project-id",
  "name": "My Workspace Name",
  "rootPath": "E:\\AgentDeck",
  "previewUrl": "http://localhost:3000",
  "health": {
    "type": "http",
    "url": "http://localhost:3000/healthz"
  },
  "services": [
    {
      "id": "frontend",
      "label": "Frontend Web",
      "shell": "powershell.exe",
      "command": "npm run dev",
      "cwd": "."
    }
  ],
  "quickActions": [
    {
      "id": "open-folder",
      "label": "Open Folder",
      "type": "openFolder"
    },
    {
      "id": "open-preview",
      "label": "Open Prompt page",
      "type": "previewUrl",
      "url": "http://localhost:3000/prompt"
    }
  ],
  "terminals": [
    {
      "name": "PowerShell",
      "shell": "powershell.exe",
      "cwd": "E:\\AgentDeck"
    }
  ]
}
```

---

## Fields Specification

### `schemaVersion`
- **Type**: `string` (Required)
- **Description**: Defines the manifest structure version. Value must be `"agentdeck.workspace.v2"`.

### `id`
- **Type**: `string` (Required)
- **Description**: Unique identifier for the workspace (only lowercase letters, numbers, dashes, and underscores are allowed).

### `name`
- **Type**: `string` (Required)
- **Description**: The human-readable workspace label displayed in sidebars and dashboards.

### `rootPath`
- **Type**: `string` (Injected automatically on load)
- **Description**: The absolute file path of the project's root folder. Used as the default current working directory (`cwd`) for processes and shell spawners.

### `previewUrl`
- **Type**: `string` (Required)
- **Description**: The default server URL loaded in the visual browser preview. Must be a local address (localhost or 127.0.0.1).

### `health`
- **Type**: `object` (Optional)
- **Description**: Defines how AgentDeck polls the service health of this workspace.
  - **`type`**: `string` (Supports `"http"` or `"tcp"`)
  - **`url`**: `string` (The probe target address, e.g. `http://localhost:3000/health`)

### `services`
- **Type**: `array` of `WorkspaceService` objects (Optional)
- **Description**: Configured processes managed under the workspace service groups control plane.
  - **`id`**: `string` (Unique service identifier, e.g. `"backend"`)
  - **`label`**: `string` (Human-readable label, e.g. `"FastAPI Server"`)
  - **`shell`**: `string` (Command shell to use, e.g., `"powershell.exe"`)
  - **`command`**: `string` (Script command to execute, e.g. `"uvicorn main:app --reload"`)
  - **`cwd`**: `string` (Optional. Directory relative to root path to run the command inside)

### `quickActions`
- **Type**: `array` of `WorkspaceQuickAction` objects (Optional)
- **Description**: Dynamic actions displayed under the workspace item in the sidebar.
  - **`id`**: `string` (Unique action identifier)
  - **`label`**: `string` (Display text for the button)
  - **`type`**: `string` (Must be one of the following:):
    - `"openFolder"`: Opens the workspace directory natively in File Explorer.
    - `"previewUrl"`: Switches the visual browser preview viewport URL to the path specified in `url`.
    - `"command"`: Spawns an interactive shell tab running the script specified in `command`.
    - `"startService"`: Boots or focuses the service matching `serviceId`.
  - **`url`**: `string` (Required for `previewUrl` action type)
  - **`command`**: `string` (Required for `command` action type)
  - **`serviceId`**: `string` (Required for `startService` action type)

### `terminals`
- **Type**: `array` of `TerminalPreset` objects (Required)
- **Description**: Default interactive shell instances instantiated automatically in xterm.js tabs when the workspace switches active scope.
  - **`name`**: `string` (Label shown on the console tab, e.g. `"WSL Ubuntu"`)
  - **`shell`**: `string` (Shell executable path, e.g. `"wsl.exe"`)
  - **`cwd`**: `string` (Optional. Folder path to boot inside. Defaults to project root path)
  - **`command`**: `string` (Optional. Command to auto-run on tab bootup, e.g. `"git status"`)
