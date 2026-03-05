# VIBΣ (Vibeflow Terminal) — Savepoint

## Current State

| Field | Value |
|-------|-------|
| Phase | Multi-LLM Support Complete |
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
- **Intelligence Layer (3 features):**
  - LSP Bridge, Context Exclusion, Auto-Project Profiling
  - System prompt append chain: `GUARDRAILS + profile + diagnostics + exclusions`
- **Security Hardening (5-phase):** Safe env, tiered permissions, CommandGuard, error recovery, sandbox + CSP
- **Multi-LLM Provider System:**
  - **Provider Registry** (`src/main/providers/types.ts`) — Core types: ProviderId, ModelDefinition, ProviderConfig, LlmClient interface
  - **Model Catalog** (`src/main/providers/model-catalog.ts`) — Static registry: Anthropic (Haiku 4.5, Sonnet 4.5/4.6, Opus 4.5/4.6), OpenAI (GPT-4o Mini, GPT-4o, o3 Mini, o3), Google (Gemini 2.0 Flash, 2.5 Pro), Ollama (dynamic)
  - **Provider Manager** (`src/main/providers/provider-manager.ts`) — Lifecycle management, config persistence to `~/.vibeflow/providers.json`, API key encryption via Electron `safeStorage` (OS keychain), connection testing, Ollama auto-detection
  - **Homegrown LLM Clients** (4 clients, all direct HTTP):
    - `anthropic-client.ts` — SDK wrapper for LlmClient interface compatibility
    - `openai-client.ts` — Direct fetch to Chat Completions API, SSE streaming
    - `google-client.ts` — Direct fetch to Gemini API, SSE streaming
    - `ollama-client.ts` — Direct fetch to local Ollama, NDJSON streaming
  - **Model Optimizer** (`src/main/model-optimizer.ts`) — Task classification engine with 6 categories (Communication, Coding, Research, Analysis, Classification, General), default + escalation model tiers, routing table persisted to `~/.vibeflow/model-optimizer.json`
  - **Model Optimizer UI** (`src/renderer/src/components/ModelOptimizer.tsx`) — Full nav tab with 3x2 category card grid, model dropdowns filtered by connected providers, cost tier badges (Cheap/Mid/Premium)
  - **Redesigned Onboarding** — 6-step flow: Welcome → Provider Selection (4 provider cards) → Auth per provider (OAuth/API key/local) → GitHub → Optimizer Setup → Done. ESC to skip, 5s timeout on auth check, macOS titlebar padding fix
  - **Session Manager Multi-Provider Routing** — Anthropic keeps full SDK path (persistent sessions, tools, orchestrator), other providers get lightweight streaming chat with full history per request
  - **IPC + Preload** — 7 new handlers: provider list, connected models, test connection, set API key, detect Ollama, optimizer config get/set

## Architecture
- **Main process:** `src/main/index.ts` — window management, app lifecycle, sandbox enabled
- **SessionManager:** `src/main/session-manager.ts` — SDK-native persistent sessions + non-Anthropic streaming chat
- **Orchestrator:** `src/main/orchestrator.ts` — task decomposition, scheduling, git, command guard, intelligence layer, provider manager, model optimizer
- **Provider System:**
  - `src/main/providers/types.ts` — Core types and LlmClient interface
  - `src/main/providers/model-catalog.ts` — Static model registry
  - `src/main/providers/provider-manager.ts` — Lifecycle, config, encryption
  - `src/main/providers/clients/` — 4 homegrown HTTP clients
- **Model Optimizer:** `src/main/model-optimizer.ts` — Task classification + routing
- **Intelligence Layer:** LSP Bridge, Context Exclusion, Auto-Project Profiling
- **CommandGuard:** `src/main/command-guard.ts` — dangerous command detection + approval queue
- **SDK Adapter:** `src/main/sdk-event-adapter.ts` — message translation layer
- **ClaudeCli:** `src/main/claude-cli.ts` — utility calls only (auth, login, connectivity)
- **Preload:** `src/preload/index.ts` — context bridge for IPC
- **Renderer:** `src/renderer/` — React + Zustand + @xyflow
- **Build:** electron-vite handles all three targets (main, preload, renderer)

## Next Steps
- [ ] Install `typescript-language-server` globally to enable LSP diagnostics for TS projects
- [ ] End-to-end testing: verify multi-provider routing (send coding → Claude, classification → GPT-4o Mini)
- [ ] Add session persistence UI (list/resume past sessions)
- [ ] Production build validation
- [ ] UI polish: cost display per provider, model selector in chat header, LSP status indicator
- [ ] Test command guard: trigger dangerous patterns and verify atomic button UX
- [ ] Provider-specific tool calling (OpenAI function calling, Gemini tool format)
