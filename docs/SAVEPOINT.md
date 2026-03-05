# VIBΣ (Vibeflow Terminal) — Savepoint

## Current State

| Field | Value |
|-------|-------|
| Phase | Security Hardening Complete |
| Branch | main |
| Last Updated | 2026-03-05 |

## Completed
- Project scaffolded: Electron + React 19 + TypeScript + Vite + Tailwind v4
- Full orchestrator: architect decomposition + concurrent worker execution
- Chat mode with session resumption
- Git snapshot/restore for undo
- Dev server management, quick actions, project switching
- GitHub integration (auth check, remote URL)
- **SDK Session Engine (v0.2.69):** Replaced subprocess spawning with `@anthropic-ai/claude-agent-sdk` native sessions
  - SessionManager with persistent `query()` + `streamInput()` for sub-second follow-ups
  - SDK Event Adapter translating SDKMessage → AgentEvent
  - One-shot architect (Sonnet, no tools) and worker (tools, streaming) via SDK
  - Auto-reconnect with session resume on disconnect
  - `chat:cost` event for usage tracking
  - `agent:set-model` IPC for live model switching
- Workspace integration: VIBΣ added to umbrella CLAUDE.md + `/vibeflow` skill
- **Security Hardening (5-phase):**
  - Phase 1: Safe env allowlist (no more full process.env leak), DOMPurify tag whitelist, URL validation on `shell.openExternal`, dev server command whitelist, quick action enum validation, IPC input validation helpers
  - Phase 2: Tiered permission model (`normal` | `bypass`) — permission decisions in main process, `dangerouslySkipPermissions` stripped from IPC
  - Phase 3: CommandGuard class with dangerous pattern regex detection, approval queue with 30s timeout, "Hold 5s to Confirm" AtomicConfirmButton component with progress ring and countdown
  - Phase 4: Robust snapshot system (history tracking, `git clean -fd` on restore), error recovery in orchestrator scheduler, React ErrorBoundary, `.catch()` on all dangling IPC promises across renderer
  - Phase 5: Electron sandbox enabled, CSP meta tag, enhanced guardrail system prompt (remote code execution, encoded obfuscation patterns)

## Architecture
- **Main process:** `src/main/index.ts` — window management, app lifecycle, sandbox enabled
- **SessionManager:** `src/main/session-manager.ts` — SDK-native persistent sessions, safe env, tiered permissions
- **Orchestrator:** `src/main/orchestrator.ts` — task decomposition, scheduling, git, command guard integration
- **CommandGuard:** `src/main/command-guard.ts` — dangerous command detection + approval queue
- **SDK Adapter:** `src/main/sdk-event-adapter.ts` — message translation layer
- **ClaudeCli:** `src/main/claude-cli.ts` — utility calls only (auth, login, connectivity)
- **Preload:** `src/preload/index.ts` — context bridge for IPC (setPermissionTier, approve/rejectDangerousCommand)
- **Renderer:** `src/renderer/` — React + Zustand + @xyflow
- **Build:** electron-vite handles all three targets (main, preload, renderer)

## Next Steps
- [ ] End-to-end testing: verify sub-second follow-up latency
- [ ] Add session persistence UI (list/resume past sessions)
- [ ] Production build validation
- [ ] UI polish: cost display, model selector
- [ ] Test command guard: trigger dangerous patterns and verify atomic button UX
