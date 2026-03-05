# VIBΣ — Vibeflow Terminal

## Description
Anti-IDE agent orchestrator — visual swarm dashboard that replaces terminal and IDE.
Persistent SDK sessions deliver sub-second follow-up messages.

## Stack
Electron + React 19 + TypeScript + Vite + Tailwind v4 + Zustand + @anthropic-ai/claude-agent-sdk

## Dev Commands
```bash
cd vibeflow-terminal && pnpm install        # install deps
cd vibeflow-terminal && pnpm dev            # dev mode with hot reload
cd vibeflow-terminal && pnpm build          # production build
cd vibeflow-terminal && pnpm typecheck      # type checking
cd vibeflow-terminal && pnpm lint           # lint
```

## Architecture

### Three-Process Model (Electron)
- **Main** (`src/main/`) — SessionManager, Orchestrator, IPC handlers
- **Preload** (`src/preload/`) — Secure context bridge (window.api)
- **Renderer** (`src/renderer/`) — React app, Zustand store, @xyflow graph

### Session Engine
- **SessionManager** (`src/main/session-manager.ts`) — SDK-native persistent sessions
  - `initChatSession()` — First message: `query({ prompt, options })` + `streamInput()`
  - `sendChatMessage()` — Follow-up: `inputController.push()` (sub-second, no respawn)
  - `runArchitect()` — One-shot Sonnet, no tools, single turn
  - `runWorker()` — One-shot with tools, streams progress events
  - Auto-reconnect: on disconnect, saves sessionId, next message resumes
- **SDK Event Adapter** (`src/main/sdk-event-adapter.ts`) — SDKMessage → AgentEvent translation

### Orchestrator Pattern
- Architect phase: Sonnet decomposes intent → JSON task array
- Worker phase: concurrent task execution (max 3) with dependency scheduling
- Git snapshots: checkpoint before intent, revert on undo
- Events: orchestrator emits → IPC forwards → Zustand store → React components

## Security Model
- Guardrail system prompt injected into every SDK call (prevents destructive commands)
- Safe environment: minimal env vars (PATH, HOME, USER, SHELL, LANG, TERM)
- Input validation: max prompt 50k chars, max system 10k, max output 10MB
- Tool whitelist: Read, Write, Edit, Bash, Glob, Grep
- Electron context isolation: preload bridge, no direct Node access from renderer

## File Structure
```
src/
├── main/
│   ├── index.ts              — Window lifecycle, app events
│   ├── orchestrator.ts        — Task decomposition + scheduling
│   ├── session-manager.ts     — SDK session engine (persistent queries)
│   ├── sdk-event-adapter.ts   — SDK → AgentEvent translation
│   ├── claude-cli.ts          — Utility CLI calls (auth, login, connectivity)
│   └── ipc-handlers.ts        — IPC handler registration
├── preload/
│   ├── index.ts              — Context bridge (window.api)
│   └── index.d.ts            — Type declarations
└── renderer/
    └── src/
        ├── stores/agentStore.ts  — Zustand state + event handling
        ├── components/           — React UI components
        └── hooks/                — Custom React hooks
```

## Conventions
- Use `pnpm` (never npm)
- `const` by default, ES modules only
- Tailwind v4 for styling
- electron-vite handles all three targets (main, preload, renderer)
- **SDK-first:** Never spawn `claude` CLI directly for sessions — use `@anthropic-ai/claude-agent-sdk`
- `ClaudeCli` class reserved for utility calls only (auth check, login, connectivity)
- No `console.log` in renderer production code
