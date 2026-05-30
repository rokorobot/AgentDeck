# Workspace Manifest Specification

Projects tell AgentDeck how to manage them by exposing a metadata configuration file named `.agentdeck/workspace.json` in their root directory.

If a project directory is added and this configuration file is missing, AgentDeck will auto-generate a default manifest pre-loaded with local PowerShell terminal settings and a mock dev script.

---

## Schema Overview

```json
{
  "schemaVersion": "agentdeck.workspace.v1",
  "id": "my-project-id",
  "name": "My Workspace Name",
  "rootPath": "E:\\AgentDeck",
  "previewUrl": "http://localhost:3000",
  "health": {
    "type": "http",
    "url": "http://localhost:3000/healthz"
  },
  "commands": [
    {
      "id": "start-dev",
      "label": "Start Dev Server",
      "shell": "powershell.exe",
      "command": "npm run dev"
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
- **Description**: Defines the manifest structure version. Currently locked to `"agentdeck.workspace.v1"`.

### `id`
- **Type**: `string` (Required)
- **Description**: Unique identifier for the workspace (alphanumeric and dashes only, lowercase recommended).

### `name`
- **Type**: `string` (Required)
- **Description**: The human-readable workspace label displayed in the side navigation panel and the status dashboard.

### `rootPath`
- **Type**: `string` (Injected automatically on load)
- **Description**: The absolute file path of the project's root folder. This is used by terminal sessions and process spawners as their current working directory (`cwd`).

### `previewUrl`
- **Type**: `string` (Optional)
- **Description**: The target address loaded in the sandboxed Browser Preview viewport panel (e.g., `http://localhost:3000`).

### `health`
- **Type**: `object` (Optional)
- **Description**: Defines how AgentDeck polls the service health of this workspace.
  - **`type`**: `string` (Supports `"http"` or `"tcp"`)
  - **`url`**: `string` (The probe target address, e.g. `http://localhost:3000/health`)

### `commands`
- **Type**: `array` of `WorkspaceCommand` objects (Optional)
- **Description**: Labeled actions exposed in the top status bar. Users run these as managed service processes.
  - **`id`**: `string` (Unique command identifier, e.g. `"start-api"`)
  - **`label`**: `string` (Text displayed on the play/stop UI buttons, e.g. `"Start API"`)
  - **`shell`**: `string` (Command shell to use, e.g., `"powershell.exe"`, `"wsl.exe"`, or `"bash"`)
  - **`command`**: `string` (The actual terminal script text, e.g. `"npm run dev"`)

### `terminals`
- **Type**: `array` of `TerminalPreset` objects (Required)
- **Description**: Shell instances instantiated automatically in xterm.js tabs when the workspace switches active scope.
  - **`name`**: `string` (Label shown on the console tab, e.g. `"WSL Ubuntu"`)
  - **`shell`**: `string` (Shell path, e.g. `"wsl.exe"`)
  - **`cwd`**: `string` (Optional. Local folder path to boot inside. Defaults to project root path)
  - **`command`**: `string` (Optional. Command to auto-run on tab boot-up, e.g. `"git status"`)
