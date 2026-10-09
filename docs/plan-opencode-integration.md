# Plan: opencode CLI Integration

## Goal

Let agents-ui manage and execute opencode assets the same way it does Claude Code assets today, with minimal duplication. Target three levels:

1. Run `opencode` inside existing terminal with zero code changes.
2. CRUD opencode agents/commands/skills from the dashboard.
3. Execute chat/sessions via `opencode run` or `opencode serve` as an alternative to `@anthropic-ai/claude-agent-sdk`.

## Background: How agents-ui Works Today

- Config root: `server/utils/claudeDir.ts:7` (`getClaudeDir()`, env override `CLAUDE_DIR`, default `~/.claude`). All API routes resolve through `resolveClaudePath()`.
- Frontmatter: `server/utils/frontmatter.ts:3` (`parseFrontmatter`, `serializeFrontmatter` using `yaml`). Generic, no provider logic.
- Data model (per `CLAUDE.md`):
  - Agents: `~/.claude/agents/*.md` with `name, description, model (sonnet|opus|haiku), color, memory`.
  - Commands: `~/.claude/commands/**/*.md` with `name, description, argument-hint, allowed-tools, agent`.
  - Skills: `~/.claude/skills/<name>/SKILL.md` with `name, description, context, agent`.
- Execution:
  - Studio/chat: `server/api/chat.post.ts:147` calls `query()` from `@anthropic-ai/claude-agent-sdk` with SSE (`text_delta`, `thinking_delta`, `tool_progress`, `tool_call`, `tool_result`). Chat v2 uses `server/api/v2/chat/ws.ts` + `server/utils/claudeSdk.ts` + `server/utils/messageNormalizer.ts` producing `NormalizedMessage`.
  - Terminal: `/cli` page (`app/components/cli/Terminal.vue`, `useTerminal.ts`, `useCliExecution.ts`) talks to `server/api/cli/ws.ts`, which spawns PTY via `server/utils/cliSession.ts` (`node-pty`). Fully generic shell.
  - Models: frontend registry `app/utils/models.ts:7` (`MODEL_IDS`, `MODEL`, `MODEL_META`); server registry `server/utils/models.ts:11` (`MODEL_IDS`, `MODEL_ALIAS`, `SERVER_MODEL_META` with pricing). No raw string literals allowed outside registries.
- Dependencies: `package.json:17` pins `@anthropic-ai/claude-agent-sdk ^0.2.76`, `node-pty`, `ws`, `chokidar`, `yaml`.

## opencode Primer (verified against opencode.ai/docs)

- Install: `curl -fsSL https://opencode.ai/install | bash`, or `npm i -g opencode-ai`, `brew install anomalyco/tap/opencode`.
- Config locations:
  - Global agents: `~/.config/opencode/agents/*.md`, project: `.opencode/agents/*.md`. Filename becomes agent name.
  - Global commands: `~/.config/opencode/commands/*.md`, project: `.opencode/commands/*.md`. Filename becomes command name.
  - Global config: `opencode.json` / `opencode.jsonc` with `$schema: https://opencode.ai/config.json`.
  - Env overrides: `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_DISABLE_CLAUDE_CODE*`.
- Agent frontmatter: `description (required), mode (primary|subagent|all), model (provider/model e.g. anthropic/claude-sonnet-4-20250514), temperature, steps, permission.*, color, hidden, disable, prompt`. Body is system prompt.
- Command frontmatter: `description, agent, model, subtask`. Body is `template` with `$ARGUMENTS` / `$1 $2...`, `` !`shell-cmd` `` output injection, `@path/to/file` includes.
- Headless: `opencode run "prompt" --agent build --model provider/model --format json --dir <dir> [--session/-s] [--continue/-c]`.
- Server: `opencode serve --port 4096 --hostname 127.0.0.1` exposes OpenAPI at `/doc`. Key routes: `POST /session`, `POST /session/:id/message`, `POST /session/:id/command`, `POST /session/:id/prompt_async`, `GET /agent`, `GET /command`, `GET /event` (SSE), `GET /config/providers`. Auth via `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME`.
- SDK: JS SDK generated from OpenAPI spec (see `/docs/sdk`). Alternative to raw HTTP.
- Interop note: opencode reads `~/.claude/CLAUDE.md` and `.claude/skills` unless disabled (`OPENCODE_DISABLE_CLAUDE_CODE=1`). Existing Claude skills/prompts are partially reusable without migration.

## Compatibility Matrix

| Concern | Claude Code | opencode | Reuse level |
|---|---|---|---|
| File shape | Markdown + YAML frontmatter | Markdown + YAML frontmatter | High: `frontmatter.ts` reusable, only field mapper needed |
| Agent fields | `name, description, model alias, color, memory` | `description, mode, model provider/id, permission, color, temperature` | Medium: needs schema + UI form per provider |
| Command fields | `argument-hint, allowed-tools` | `$ARGUMENTS template, agent, subtask` | Medium: template preview differs |
| Skills | `SKILL.md` + `context, agent` | Agent Skills spec, loaded as tools | Medium-high |
| Models | `sonnet/opus/haiku` alias | `provider/model` (any provider) | Low: registry must become `provider/model` aware |
| Execution (chat) | `query()` SDK, sessions resumable | `opencode run` / `POST /session/:id/message` | Low: new backend adapter needed, but `NormalizedMessage` can be kept |
| Terminal | `claude` binary in PTY | `opencode` / `opencode attach` in PTY | High: already generic |
| MCP/tools | `.mcp.json`, strict MCP UI | `/mcp` API, `opencode mcp add/list` | Medium |

## Phased Plan

### Phase 0: Zero-code Terminal Support (no changes, verify only)

- Confirm `opencode` binary on PATH in dev and Docker (`Dockerfile`, `docker-compose.yml`).
- From `/cli` page, start standalone session, run `opencode`, `opencode agent list`, `opencode run "explain this repo" --format json`.
- Document in README/docs that Terminal mode already supports opencode.
- Acceptance: user can drive opencode TUI/headless from agents-ui terminal.

### Phase 1: File Manager Dual-provider (CRUD without execution)

Goal: list/create/edit/delete opencode agents and commands alongside Claude ones.

Tasks:

1. Provider abstraction:
   - New `server/utils/providerDir.ts` (or extend `claudeDir.ts`): `getProviderRoot(provider: 'claude'|'opencode', scope: 'global'|'project', projectDir?)`.
   - Env: `OPENCODE_CONFIG_DIR` (default `~/.config/opencode`), project scope `.opencode/` under `projectDir`.
   - Keep `getClaudeDir()` as-is for backwards compat; add `resolveOpencodePath()`.
2. Schema adapters:
   - New `server/utils/opencodeSchemas.ts`: Zod-like TS types + defaults for agent/command frontmatter, plus `claudeToOpencode()` / `opencodeToClaude()` mappers (lossy fields flagged, e.g. `memory` has no opencode equivalent, `mode/permission` has no Claude equivalent).
   - Extend `server/api/agents/*`, `server/api/commands/*`, `server/api/skills/*` with `?provider=` query or duplicate under `server/api/opencode/agents/*` (preferred to avoid breaking existing clients).
   - Reuse `parseFrontmatter` / `serializeFrontmatter`.
3. Frontend:
   - Add `useProvider.ts` composable (selected provider + scope global/project), provider toggle in top bar.
   - Extend `useAgents.ts`, `useCommands.ts` to pass provider param; add opencode-specific form fields (`mode, permission, temperature`) behind `v-if`.
   - Extend model picker: keep `MODEL_OPTIONS` for Claude, add free-form `provider/model` input + `opencode models` list for opencode (see Phase 2).
   - Relationship graph (`relationships.ts`, `/graph` page): include `@mention` subagent refs and `/command` refs, which both systems use.
4. Testing:
   - CRUD round-trip against temp `OPENCODE_CONFIG_DIR`, verify `opencode agent list` picks up created files.
   - Typecheck (`bun run typecheck`), manual UI check for both providers.

### Phase 2: Execution via opencode (chat + run)

Option A (simple, stateless): shell out to `opencode run`.

- New `server/utils/opencodeRun.ts`: `spawn('opencode', ['run', prompt, '--format', 'json', '--agent', '--model', '--dir'])`, stream JSON events, map to existing SSE types (`text_delta`, `tool_call`, etc.).
- Pros: no daemon, works per-request. Cons: MCP cold boot each call, no true streaming without `--format json` parsing, session resume via `--session/--continue` only.

Option B (recommended, stateful): sidecar `opencode serve` + HTTP client.

- New `server/utils/opencodeServer.ts`: ensure server running (spawn if `GET /global/health` fails), manage base URL/port/auth from env (`OPENCODE_SERVER_PASSWORD`).
- New `server/api/opencode/sessions/*` or adapter inside `server/api/chat.post.ts` + `server/api/v2/chat/ws.ts`: `POST /session` -> `POST /session/:id/message` (or `/prompt_async` + `GET /event` SSE) -> normalize to `NormalizedMessage` via `messageNormalizer.ts`.
- Add `opencode-sdk` JS dependency (generated client) instead of hand-rolled fetch where possible.
- Reuse `chatSessionStorage.ts` JSONL persistence; store `provider: 'opencode'`, opencode `sessionID`, `agent`, `model`.
- Frontend `useWebSocketChat.ts` / `useChatSessions.ts`: add provider field, permission-approval UI maps to `POST /session/:id/permissions/:permissionID`.
- Acceptance: Studio chat works with provider switch, streaming text + tool calls visible, sessions list/resume works.

Recommendation: implement A first for validation (1-2 days), then B for parity.

### Phase 3: Parity and Polish

- `opencode.json` editor: read/merge global + project config (`GET /config`, `PATCH /config`), UI form for `agent{}`, `command{}`, `permission{}`, `mcp{}`.
- MCP panel: `GET /mcp`, `opencode mcp list` integration alongside existing `server/api/mcp/*`.
- Stats/cost: `opencode stats`, `opencode export <sessionID>` mapped to `useUsageStats.ts`; pricing registry extended for `provider/model` (fallback to unknown-pricing gray badge).
- Schedules/workflows: allow workflow step to specify `provider + agentSlug`, execute via respective backend.
- Docs + setup: `docs/setup-macos.md` style guide for opencode prerequisites, Docker image includes opencode binary.

## Risks and Open Questions

- Model string divergence: Claude uses short aliases, opencode uses `provider/model`. Registry change touches many components; keep fallback label = raw string (already done in `getModelLabel`).
- Permission model divergence: Claude `allowed-tools` list vs opencode `permission: {edit, bash, ...: allow|ask|deny}` with glob patterns. No 1:1 mapping; migration must be explicit, never silent.
- Server lifecycle: who owns `opencode serve` (agents-ui spawns vs user provides URL)? Need port allocation, auth, multi-project isolation. Start with user-provided URL + auto-spawn localhost fallback.
- Streaming format differences: Claude SDK `stream_event` vs opencode SSE `bus events` / message parts. Normalizer must handle both; keep `NormalizedMessage` as contract.
- Scope decision: read-only file manager first, or full execution? Recommend file manager first because it delivers value without daemon complexity.

## Suggested Next Step

Implement Phase 0 verification + Phase 1 file listing (read-only `GET /api/opencode/agents`, `GET /api/opencode/commands`) behind feature flag. Confirm with user before writing execution code or adding SDK dependency.

## References

- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/commands/
- https://opencode.ai/docs/cli/
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/sdk/
- Local: `server/utils/claudeDir.ts`, `server/utils/frontmatter.ts`, `server/api/chat.post.ts`, `server/api/cli/ws.ts`, `app/utils/models.ts`, `server/utils/models.ts`
