# Release Notes & Packaging Guide - AgentDeck v0.6

This document contains the release notes for **AgentDeck v0.6.0** (along with cumulative summaries of v0.4.0 and v0.5.0 milestones) and a setup guide outlining how to build the packaged desktop installer and bypass Windows SmartScreen warnings.

---

## 1. Unsigned Installer Warning (Windows SmartScreen)

AgentDeck v0.6 is currently unsigned. Windows may show a SmartScreen warning for unsigned installers. Only run the installer if you downloaded it directly from the official GitHub release and trust the source.

For informational purposes, here are the steps for proceeding with installation if you choose to trust this release:
1. Double-click the `AgentDeck Setup <version>.exe` installer.
2. If the **"Windows protected your PC"** SmartScreen warning appears, the option to run is accessed via:
   - Clicking the **"More info"** hyperlink.
   - Clicking the **"Run anyway"** button that appears at the bottom of the informational display.
3. The NSIS installer will initialize, install the application files, create a desktop shortcut, and launch the AgentDeck developer console dashboard.

---

## 2. Release Changelog

### v0.6.0 — Packaging & Release Polish (Current Release)
- **Local App Icon**: Integrated a custom, high-contrast squircle app icon under `build/icon.png`.
- **Packaging Build Pipeline**: Exposes the `npm run dist` script executing Vite compiles, TypeScript checks, and `electron-builder` NSIS packagers concurrently.
- **Architectural & Schema Documentation**: Fully updated the workspace manifest specification (`docs/workspace-manifest-spec.md`) and the multi-process layering diagrams (`docs/architecture.md`).

### v0.5.0 — Workspace Templates & Visual Manifest Editor
- **Template Wizard**: Automates directory onboarding. Prompts templates cards selection (Vite, Python FastAPI, Static Web, Custom) when loading folders lacking configuration files.
- **Visual Editor**: Full-page forms configurator allowing visual edits of Name, Preview URLs, services command groups, quick action redirects, and terminals presets.
- **Backups & Atomic Writes**: Backs up existing files to timestamped `.bak-YYYYMMDD-HHMM` copies. Writes updates atomically using temporary swapping files.
- **Preset Protection**: Locks default workspaces (`sound-machina`, `tm4`, `robotstore`) as read-only.

### v0.4.0 — Workspace Service Groups
- **Service Orchestration**: Implemented coordinated group commands (`START ALL`, `STOP ALL`, `RESTART ALL`) for services.
- **Targeted Terminations**: Restricts process killings to managed service lists, preserving raw user PowerShell/WSL interactive tabs.
- **Runtime status widget**: Displays a dashboard card monitoring active service count, Ollama status, N/A memory, and port indicator lights (3000, 8000, 5173).

---

## 3. How to Package the Windows Installer Locally

To generate the packaged Windows installer manually from source code:

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Build and package the binary distribution:
   ```powershell
   npm run dist
   ```
3. Locate the generated setup files inside the `dist-package/` directory:
   - `AgentDeck Setup 0.1.0.exe` (Packaged setup installer)
