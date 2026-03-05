# VIBΣ (Vibeflow Terminal) — Features

## Core Engine
- **SDK Session Engine** — Persistent Claude sessions via `@anthropic-ai/claude-agent-sdk` `query()` + `streamInput()`. First message ~3s, follow-ups sub-second (no process respawn)
- **SessionManager** (`src/main/session-manager.ts`) — Singleton managing chat sessions (Anthropic SDK + non-Anthropic streaming), architect calls, and worker tasks
- **SDK Event Adapter** (`src/main/sdk-event-adapter.ts`) — Translates SDK `SDKMessage` types to internal `AgentEvent` types
- **Multi-Provider Chat** — Non-Anthropic providers use lightweight streaming chat with full message history per request. Anthropic retains full SDK path with persistent sessions and tool use

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

## Intelligence Layer
- **Auto-Project Profiling** (`src/main/project-profiler.ts`) — Scans project root on boot and `switchProject()`. Detects language (TS/JS/Rust/Python/Go), framework (Next/Vite/Tauri/Electron/FastAPI/Django/etc.), package manager (pnpm/npm/yarn/bun/cargo/poetry), dev/build/test commands, git branch, entry files. Profile injected into system prompt and displayed in RightSidebar
- **Context Exclusion** (`src/main/context-filter.ts`) — Reads `.vibeflowignore` (gitignore syntax) from project root. Homegrown glob matcher supports `*`, `**`, `?`, `dir/` trailing slash, `!` negation. Generates system prompt clause instructing agent to avoid excluded paths
- **LSP Bridge** (`src/main/lsp-bridge.ts`) — Detects project language, spawns appropriate LSP server (typescript-language-server, rust-analyzer, gopls, pyright) via JSON-RPC over stdio. Collects `publishDiagnostics` notifications, caches per-file, formats error/warning summary for system prompt injection. Gracefully skips if binary not installed
- **System Prompt Append Chain** — SessionManager's `buildAppendPrompt()` composes: `GUARDRAILS + projectProfile + diagnostics + exclusions`. Each clause only appended when non-empty

## Dev Tools
- **Dev Server** — Spawn/kill dev server from UI
- **Quick Actions** — Commit, test, push, run, undo
- **Project Switching** — Navigate between workspace projects (triggers intelligence refresh)

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

## Multi-LLM Provider System
- **Provider Registry** (`src/main/providers/types.ts`) — Core types: `ProviderId` (anthropic/openai/google/ollama), `ModelDefinition`, `ProviderConfig`, `LlmClient` interface with streaming + non-streaming overloads
- **Model Catalog** (`src/main/providers/model-catalog.ts`) — Static registry of all cloud models with metadata (cost tier, context window, capabilities, pricing). Anthropic: Haiku 4.5, Sonnet 4.5/4.6, Opus 4.5/4.6. OpenAI: GPT-4o Mini, GPT-4o, o3 Mini, o3. Google: Gemini 2.0 Flash, 2.5 Pro. Ollama: dynamic discovery
- **Provider Manager** (`src/main/providers/provider-manager.ts`) — Load/save config to `~/.vibeflow/providers.json`, API keys encrypted via Electron `safeStorage` (OS keychain), connection testing per provider, Ollama auto-detection via `/api/tags`
- **Homegrown LLM Clients** — 4 direct HTTP clients (no third-party SDKs):
  - `anthropic-client.ts` — SDK wrapper implementing LlmClient for classification calls
  - `openai-client.ts` — Direct `fetch()` to OpenAI Chat Completions API, SSE streaming parser
  - `google-client.ts` — Direct `fetch()` to Gemini API, SSE streaming with role mapping
  - `ollama-client.ts` — Direct `fetch()` to local Ollama, NDJSON streaming parser

## Model Optimizer
- **Task Classification** (`src/main/model-optimizer.ts`) — Uses a cheap model (Haiku/GPT-4o-mini) to classify user intent into 6 categories: Communication, Coding, Research, Analysis, Classification, General
- **Two-Tier Routing** — Each category has a default model (cheap/fast) and an escalation model (more capable, used on retry). Routing table persisted to `~/.vibeflow/model-optimizer.json`
- **Model Optimizer UI** (`src/renderer/src/components/ModelOptimizer.tsx`) — Full nav tab ("Optimizer") with:
  - 3x2 grid of category cards
  - Each card: icon + label + description + default/escalation model dropdowns
  - Cost tier badges (Cheap=green, Mid=amber, Premium=purple)
  - Dropdowns filtered to connected providers only
  - "Apply" button with save confirmation

## Onboarding (Redesigned)
- **6-Step Flow:** Welcome → Provider Selection → Auth → GitHub → Optimizer Setup → Done
- **Provider Selection** — Grid of 4 provider cards with brand colors: Anthropic (coral), OpenAI (green), Google (blue), Ollama (orange). Multi-select supported
- **Per-Provider Auth:**
  - Anthropic: OAuth via `claude login` (existing flow)
  - OpenAI/Google: API key input with show/hide toggle + inline connection test
  - Ollama: Auto-detected if running, one-click connect
- **Critical Fix:** 5s timeout on auth check (prevents infinite spinner), ESC key to skip, macOS titlebar padding (traffic light buttons accessible)

## Workspace Integration
- `/vibeflow` skill in umbrella `.claude/skills/vibeflow/SKILL.md`
- VIBΣ section in umbrella `CLAUDE.md`
- Full project CLAUDE.md with architecture docs
