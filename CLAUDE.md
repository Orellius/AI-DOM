# VIBΣ — Vibeflow Terminal

## Description
Agent orchestrator UI — visual swarm dashboard for Claude CLI workflows

## Stack
Electron + React 19 + TypeScript + Vite + Tailwind v4

## Dev Commands
```bash
cd vibeflow-terminal && pnpm install        # install deps
cd vibeflow-terminal && pnpm dev            # dev mode with hot reload
cd vibeflow-terminal && pnpm build          # production build
cd vibeflow-terminal && pnpm typecheck      # type checking
cd vibeflow-terminal && pnpm lint           # lint
```

## Conventions
- Use `pnpm` (never npm)
- `const` by default, ES modules only
- Tailwind v4 for styling
- Electron main process in `src/main/`, preload in `src/preload/`, renderer in `src/renderer/`
