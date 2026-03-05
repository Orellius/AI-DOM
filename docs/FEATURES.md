# VIBΣ (Vibeflow Terminal) — Features

## Core Engine
- **SDK Session Engine** — Persistent Claude sessions via `@anthropic-ai/claude-agent-sdk` `query()` + `streamInput()`. First message ~3s, follow-ups sub-second (no process respawn)
- **SessionManager** (`src/main/session-manager.ts`) — Singleton managing chat sessions, architect calls, and worker tasks through the SDK
- **SDK Event Adapter** (`src/main/sdk-event-adapter.ts`) — Translates SDK `SDKMessage` types to internal `AgentEvent` types

## Agent Orchestration
- **Architect Decomposition** — Sonnet-powered intent → task array decomposition (one-shot, no tools)
- **Concurrent Workers** — Up to 3 parallel task executors with dependency scheduling
- **Task Graph** — @xyflow visualization of task dependencies and execution status

## Chat Mode
- **Persistent Sessions** — Single SDK process stays alive across messages
- **Session Resume** — Auto-reconnect with `resume: sessionId` on disconnect
- **Streaming** — Real-time text + tool use events
- **Cost Tracking** — `chat:cost` events capture USD cost and turn count per response
- **Live Model Switching** — `agent:set-model` IPC changes model on running session

## Git Integration
- **Snapshots** — Checkpoint before each intent (git commit)
- **Undo** — Restore to any snapshot via `git reset --hard`
- **File Change Detection** — `git diff` after task completion

## Dev Tools
- **Dev Server** — Spawn/kill dev server from UI
- **Quick Actions** — Commit, test, push, run, undo
- **Project Switching** — Navigate between workspace projects

## Security
- **Safe Env Allowlist** — Only PATH, HOME, USER, SHELL, LANG, TERM, NODE_ENV, EDITOR, TERM_PROGRAM passed to SDK sessions (no API key/token leaks)
- **Tiered Permission Model** — `normal` (SDK default permissions) | `bypass` (current non-stop flow). Controlled by main process, not renderer
- **CommandGuard** (`src/main/command-guard.ts`) — Regex pattern matching for dangerous commands (rm -rf, fork bombs, curl|sh, base64 decode, reverse shells, SSH exfiltration). Emits approval queue events
- **Atomic Confirm Button** (`src/renderer/src/components/AtomicConfirmButton.tsx`) — Hold 5s to approve dangerous commands. Progress ring, 30s auto-reject timeout
- **Dev Server Whitelist** — Only `pnpm dev|start|serve`, `npm run dev|start`, `yarn dev|start`, `npx vite`, etc.
- **DOMPurify Hardening** — ALLOWED_TAGS whitelist, FORBID_TAGS (img, video, audio, form, iframe, object, embed, script, style)
- **URL Validation** — `shell.openExternal` only allows http/https protocols
- **IPC Input Validation** — `validateString()` and `validateEnum()` helpers on all handlers
- **CSP** — Content-Security-Policy meta tag restricting scripts, styles, fonts, images, connections
- **Electron Sandbox** — `sandbox: true` on BrowserWindow
- **Enhanced Guardrails** — System prompt covers: remote code execution, encoded obfuscation, reverse shells

## Data Loss Failsafes
- **Snapshot History** — Orchestrator keeps last 20 snapshots in memory, accessible via `agent:list-snapshots`
- **Git Clean on Restore** — `git clean -fd` alongside `git reset --hard` for full state restoration
- **Error Boundary** (`src/renderer/src/components/ErrorBoundary.tsx`) — Catches renderer crashes with "Try Again" button
- **Promise Error Handling** — `.catch()` on all IPC promises across renderer components (App, Onboarding, DevServerPanel, SettingsPanel, UmbrellaSync, agentStore)
- **Scheduler Error Recovery** — `scheduleNext()` wrapped in try-catch, emits error event on failure

## Infrastructure
- **Electron** — Three-process model (main, preload, renderer), sandbox enabled
- **IPC Bridge** — Secure context-isolated communication with validation
- **Guardrails** — Safety system prompt on every SDK call
- **Input Validation** — Size limits, tool whitelist, path validation, enum validation

## Workspace Integration
- `/vibeflow` skill in umbrella `.claude/skills/vibeflow/SKILL.md`
- VIBΣ section in umbrella `CLAUDE.md`
- Full project CLAUDE.md with architecture docs
