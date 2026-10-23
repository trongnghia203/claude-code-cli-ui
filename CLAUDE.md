# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

agents-ui is a Nuxt 3 dashboard for managing Claude Code agents, commands, skills, workflows, plugins, MCP servers, schedules and sessions. It is a GUI layer over the `~/.claude` directory: it reads and writes the markdown/JSON files there, so users never edit them by hand. Personal fork, solo work (see `CLAUDE.local.md`).

## Development Commands

```bash
bun run dev          # dev server at http://localhost:3030 (npm run dev also works)
bun run build        # production build
bun run preview      # preview production build
bun run typecheck    # nuxt typecheck
```

There is no test or lint script. Verify changes by typechecking and exercising the UI. For file CRUD, check that files appear, change and disappear under `~/.claude/`.

Env: `CLAUDE_DIR` overrides the default `~/.claude` (resolved in `server/utils/claudeDir.ts`).

## Architecture

Nuxt 3 + Vue 3 frontend (`app/`) and Nitro server API (`server/`). There is no database: the file system under `CLAUDE_DIR` is the store.

### Frontend (`app/`)

- **Pages** (`app/pages/`): one section per entity with an index and `[slug]` editor - `agents`, `commands`, `skills`, `workflows`, `plugins`, `mcp`. Plus `graph` (relationships), `explore` (templates and marketplace), `memory`, `output-styles`, `schedules`, `logs`, `usage`, `settings`, `project-artifacts`, and `cli` (terminal and chat, per-project routes under `cli/project/[projectName]/`).
- **Composables** (`app/composables/`): `useCrud.ts` provides the shared `fetchAll`/`fetchOne`/`create`/`update`/`remove`. Entity composables (`useAgents`, `useCommands`, `useSkills`, `useWorkflows`) wrap it. Streaming and session logic lives in `useStudioChat`, `useWebSocketChat`, `useChatV2Handler`, `useSessionStore`, `useTerminal`, `useContextMonitor`, `useCliExecution`.
- **Components**: `chat/*`, `studio/*`, `cli/*` are auto-imported without a directory prefix. Everything else uses standard Nuxt naming.
- **Types**: all centralized in `app/types/index.ts`.

### Server (`server/`)

- `server/api/` mirrors the pages. CRUD routes are REST (`GET/POST /api/agents`, `GET/PUT/DELETE /api/agents/[slug]`, same for commands, skills, workflows). Other groups: `chat`, `chat-ws`, `cli`, `github`, `marketplace`, `mcp`, `memory`, `plugins`, `schedules`, `sessions`, `usage`, `v2`, plus `relationships.get.ts`.
- `server/utils/` holds the logic. Notable files:
  - `claudeDir.ts`, `frontmatter.ts` - locate `~/.claude`, parse and serialize YAML frontmatter plus markdown body.
  - `effectiveSettings.ts` - reads the user, project and local settings files and merges them like Claude Code (objects key by key, arrays joined without duplicates, scalars from the highest file: local > project > user). Pass `workingDir` to make a view project-aware. Used by `mcpSources.ts` (a server is `denied`, `disabled`, `rejected` or `pending`), the plugins and skills APIs (`enabledPlugins`, `skillOverrides` per project) and `GET /api/projects/settings-effective` (the Settings "Effective" tab).
  - `relationships.ts` - builds the agent/command/skill graph from the `agent:` frontmatter field, `subagent_type: "name"` patterns, `/command-name` references and direct slug mentions.
  - `claudeSdk.ts`, `messageNormalizer.ts`, `chatSessionStorage.ts`, `providers/` - chat on top of `@anthropic-ai/claude-agent-sdk`.
  - `cliSession.ts`, `contextMonitor.ts` - PTY sessions (node-pty) and token, cost and file-change monitoring (chokidar).
  - `github.ts`, `githubSkillSymlinks.ts`, `marketplace.ts` - skill import from GitHub repos and plugin install.
  - `schedules/` (`scheduler.ts`, `launchd.ts`) - scheduled runs. `memoryFiles.ts`, `memoryGit.ts` - memory files with git history.

### Data model (files in `CLAUDE_DIR`)

- Agents: `agents/*.md`, frontmatter `name`, `description`, `model` (sonnet | opus | haiku), `color`, `memory`.
- Commands: `commands/**/*.md`, frontmatter `name`, `description`, `argument-hint`, `allowed-tools`, optional `agent`.
- Skills: `skills/[name]/SKILL.md`, frontmatter `name`, `description`, `context`, optional `agent`.
- Workflows: `workflows/*.json` with `name`, `description`, `steps[{id, agentSlug, label}]`, `createdAt`.
- Imports are tracked in `.imports.json`. CLI history goes to `cli-history/{sessionId}.json`. Chat sessions are JSONL in `chat-sessions/{sessionId}.jsonl`.

### Chat and terminal

- **Studio chat** (agent page test panel): SSE from `server/api/chat.post.ts`, which calls the SDK `query()` and streams `text_delta`, `thinking_delta` and `tool_progress` events. The system prompt is the default "Agent Manager" prompt or the selected agent's body. Session IDs continue conversations.
- **`/cli` page** has Terminal and Chat tabs sharing the agent selector and working directory. Both modes can run agent-aware (agent body as system prompt, its model applied) or standalone.
- **Terminal** WebSocket (`server/api/cli/ws.ts`). Client sends `execute | input | resize | kill`. Server sends `session | output | context_update | token_update | file_change | tool_call | error | exit`. Sessions are in-memory PTYs, auto-terminated after 30 minutes idle, output buffer capped at 10,000 lines.
- **Chat** WebSocket (`server/api/chat/ws.ts`). SDK events are normalized to `NormalizedMessage` (`kind`: `text | thinking | tool_use | tool_result | stream_delta | stream_end | complete | error`) and persisted append-only as JSONL. History loads the last 50 messages with backend pagination.

## Model Registry Design

All model data is centralized in two files. Never inline model colors, labels, pricing, option lists, or raw model-string comparisons elsewhere.

- **Frontend** `app/utils/models.ts`: `MODEL` (OPUS/SONNET/HAIKU constants), `MODEL_IDS`, `MODEL_META` (label, tagline, description, badge colors, color, contextWindow), `MODEL_OPTIONS*` for pickers, `DEFAULT_MODEL`, and helpers `getModelLabel`, `getModelTagline`, `getModelColor`, `getModelBadgeClasses`, `getModelBadgeStyle`.
- **Server** `server/utils/models.ts`: `MODEL_ALIAS_KEY`, `DEFAULT_MODEL_ALIAS`, `SERVER_MODEL_META` (pricing and context window), `MODEL_ALIAS` (alias to full id), `getModelPricing`, `getModelContextWindow`, `resolveModelMeta`.

Rules:
1. Compare and default with constants: `ref(DEFAULT_MODEL)`, `model === MODEL.SONNET`, `MODEL_IDS.map(...)`. Never `ref('sonnet')` or `model === 'opus'`. Server code uses `MODEL_ALIAS_KEY.X` the same way.
2. Raw model strings live only in the two registry files.
3. No per-model hardcoded `rgba()` or `{ opus: ..., sonnet: ... }` maps in components.
4. The two layers cannot import each other (different module contexts), so a new model is added in both: `MODEL`/`MODEL_IDS`/`MODEL_META` on the frontend and `MODEL_ALIAS_KEY`/`MODEL_ALIAS`/`SERVER_MODEL_META` on the server. Update pricing only in `SERVER_MODEL_META`.
5. Legacy helpers (for example `getFriendlyModelName` in `terminology.ts`) stay with `@deprecated` and delegate to the new helpers.
