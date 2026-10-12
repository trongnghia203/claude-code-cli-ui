# Ideas: Monetize agents-ui via Hosted Frontend + Bring-Your-Own Backend

Date: 2026-10-10
Status: feasibility study, nothing built yet

## Summary of the idea

1. Split the web UI (frontend) from the Nuxt server. Host the UI in the cloud (cPanel or VPS) with registration, login, subscription, and a "1 device at a time" rule.
2. The hosted UI connects to a backend (claude CLI + agents-ui API) running on the user's localhost or on the user's own VPS.
3. Alternative: user brings a Claude API key or an OpenAI (ChatGPT) API key.
4. Later: support Codex CLI and opencode CLI as backends.

## Verdict

| Idea | Technical feasibility | Business/legal feasibility | Overall |
|---|---|---|---|
| 1. Hosted UI + auth + subscription + 1 device | High | Medium (open source MIT, strong free competition) | Feasible |
| 2. Hosted UI talks to user's local/VPS backend | Medium | n/a | Feasible, with real security cost |
| 3a. User brings Anthropic API key | High | High (allowed) | Feasible |
| 3b. User logs in with Claude subscription (Pro/Max) via your site | n/a | Blocked by Anthropic terms | Do not build |
| 3c. Hosted agent execution for users with no backend | Low | Medium | Different product, high cost |
| 4. OpenAI key / Codex CLI / opencode | Medium | High | Feasible, opencode is best lever |

Recommendation: build 1 + 2 as a thin "hosted shell + local bridge" MVP. Use opencode (already planned) as the multi-provider path. Skip anything that routes consumer Claude/ChatGPT subscriptions through your service. Validate willingness to pay before spending more than ~2-3 weeks.

## What the repo looks like today (facts from code)

- Nuxt 3 full-stack app. UI and API ship together. `nuxt.config.ts` has `nitro.experimental.websocket: true`, no SPA mode.
- 45 frontend files call `$fetch('/api/...')` with relative URLs. No base URL abstraction.
- Three WebSocket clients build the URL from `window.location.host`: `useTerminal.ts:122`, `useChatV2Handler.ts:57`, `useWebSocketChat.ts:32`.
- Server reads and writes `~/.claude` (agents, skills, commands, sessions, memory), spawns PTY shells (`node-pty`), runs `@anthropic-ai/claude-agent-sdk`, watches files with chokidar. All of this must stay on the user's machine. It cannot move to your cloud.
- No authentication. No CORS handling. `bin/start.mjs` binds `HOST=0.0.0.0` by default. Today that is fine only because users run it on a trusted laptop.
- A provider abstraction already exists: `server/utils/providers/types.ts` (`ProviderAdapter`) and `registry.ts`. Only `claude` is registered.
- `docs/plan-opencode-integration.md` already plans opencode support in phases.
- License is MIT. Anyone can self-host for free.

## Idea 1: Hosted frontend with accounts, subscription, 1 device

### Architecture

```
Browser -> https://app.yourdomain.com   (static SPA, from your CDN/host)
              |
              |  login/subscription  -> Auth + Billing service (yours)
              |
              |  API + WS (user-configured base URL, with pairing token)
              v
        User backend: agents-ui server + claude CLI
        (localhost:3030  OR  user's VPS behind HTTPS)
```

Your cloud holds: static files, user accounts, subscription state, device sessions. Your cloud does not hold: user files, prompts, API keys, agent data. This keeps cost and liability low.

### Work needed in the repo

1. Split the app into two build targets:
   - Frontend: `nuxt generate` (SPA, `ssr: false`). Check that no page needs server rendering. Likely fine since it is a dashboard.
   - Backend ("bridge"): Nitro server only, published as `npx agents-ui-bridge` / Docker image / Homebrew. Existing `bin/start.mjs` is a base.
2. Add an API client layer: one `useApi()` wrapper with a configurable `apiBase` and auth header. Replace 45 relative `$fetch` call sites and 3 WebSocket URL builders. Mostly mechanical, 1-2 days.
3. Bridge hardening (see Security): bind `127.0.0.1` by default, CORS allowlist, pairing token, origin check on WebSocket upgrade.
4. Connection screen in UI: "Backend URL" + "Pairing token", health check, version check (UI vs bridge API version).
5. Auth/subscription gate in the hosted build only. Keep the self-hosted build open and ungated (MIT anyway).

### Hosting: cPanel vs VPS

- Static SPA needs only static hosting. cPanel shared hosting can do that, but Cloudflare Pages / Netlify / Vercel free tiers are better: free, global CDN, auto HTTPS, no server to patch.
- Do not run Nuxt SSR on cPanel. Node on shared cPanel is fragile and not needed once the UI is static.
- Auth + billing: do not hand-roll. Use a managed service.
  - Auth: Supabase Auth, Clerk, or Firebase Auth. Email + Google/GitHub login.
  - Billing: Stripe is the default, but check availability for a seller in Vietnam. Merchant-of-record options (Paddle, Lemon Squeezy, Polar) handle VAT/tax and often work where Stripe does not. Verify current country support before choosing.
  - Small backend for webhooks and device-session logic: Supabase Edge Functions, Cloudflare Workers, or a small VPS. A VPS is only needed if you want your own API server.
- Rough cost at MVP stage: $0-25/month plus payment fees (about 3-6% + fixed fee, more with merchant of record).

### "1 device at a time"

Because the UI is served only from your site, gating is enforceable (unlike a CLI that can be forked and patched). Design:

- On login, server creates a `device_session` row (`user_id`, `session_id`, `device_fingerprint`, `last_seen`).
- Access JWT is short lived (5-15 min) and tied to `session_id`. Refresh requires the session to still be the active one.
- New login either kicks the old session or is refused, depending on policy. Recommend "kick old, show notice" (less support load).
- Heartbeat every 30-60 s from UI to mark active; stale after ~2 min so a closed laptop does not lock the user out.
- Limits: it is a per-account rule, not true device binding. Credential sharing is deterred but not impossible. Good enough for this product.
- Also bind to the bridge: the bridge only trusts requests carrying the pairing token, so a second browser on another machine still needs that token.

Caveat: the self-hosted MIT build bypasses all of this. Your paid value must be convenience (hosted, updates, sync, support, extra features), not lock-in.

### Business reality check

- MIT plus free self-hosting means you compete with your own repo. Common answers: open core (paid hosted features), or relicense new/hosted-only modules. Relicensing already-published MIT code is not retroactive for existing copies.
- Competitors and substitutes, several free: Claude Code Desktop and Claude Code on the web (official), Remote Control features, community UIs (for example claudecodeui, opcode, CodePilot, Happy Coder), VS Code and JetBrains extensions. Verify the current landscape before pricing. Official features keep expanding, which erodes a thin wrapper.
- Features worth paying for are the ones official tools lack: visual agent/skill/workflow management, relationship graph, schedules, usage and cost analytics, multi-provider (Claude + OpenAI + others), team-shared configs, config sync across machines, mobile access.
- Suggested pricing to test: Free (self-host), Pro ~$5-12/month or ~$49-99/year, Team later. Needs a waitlist/landing page to validate before building billing.

## Idea 2: Hosted UI connects to user's backend

### Local backend (localhost)

Works in principle. The page is HTTPS, the backend is `http://localhost:3030`.

- Chrome and Firefox treat `localhost` as a trustworthy origin, so mixed-content rules usually allow `fetch` and `ws://` to it.
- Safari has historically blocked mixed content to localhost, including WebSockets. Expect Safari to need a workaround (local HTTPS cert, or recommend Chrome/Firefox/Edge). Verify on current Safari.
- Chrome is rolling out Local Network Access / Private Network Access restrictions: public site calling a local address triggers a permission prompt and requires the bridge to answer preflight with `Access-Control-Allow-Private-Network: true`. Plan for the prompt and test on current Chrome.
- Bridge must send correct CORS headers for your exact origin only (not `*`).

### Remote backend (user's VPS)

- Must be HTTPS and WSS (page is HTTPS, mixed content blocked). User needs a domain + TLS (Caddy or nginx + Let's Encrypt). Provide a docker-compose with Caddy to make it one command.
- Needs auth at the bridge: bearer token at minimum, ideally a user-generated long random secret plus origin allowlist.
- Alternative: relay/tunnel through your cloud (bridge dials out to your WebSocket relay; browser connects to relay). Solves NAT and certs for everyone, including Safari. Costs: your bandwidth and ops, and you are now in the data path (prompts, file contents, terminal I/O). That raises privacy and liability a lot. Defer. If done later, use end-to-end encryption between browser and bridge so the relay sees only ciphertext.

### Security (the main risk of this idea)

The bridge exposes a PTY shell and file read/write. Any website origin that can reach it equals remote code execution on the user's machine.

Threats and mitigations:

| Threat | Mitigation |
|---|---|
| Random website calls localhost bridge (CSRF / DNS rebinding) | Origin allowlist (exact match), `Host` header check, pairing token on every request and WS upgrade |
| Bridge exposed on network (`0.0.0.0`, current default) | Default `127.0.0.1`. Require explicit flag plus token for remote bind |
| Your hosted site compromised or XSS | Strict CSP, no third-party scripts, SRI, pinned dependencies, 2FA on host/DNS/registrar, signed releases. A compromised hosted frontend can drive every paired bridge. This is the biggest single liability of the model |
| Token theft | Token generated by bridge on first run, stored in browser only for that origin, revocable, optional rotation |
| Scope creep | Add a "read-only / no terminal" mode on the bridge for lower-trust setups |

Treat this as security-critical code. Budget a review pass before public launch. Add a clear user-facing disclosure of what the hosted UI can do to the paired machine.

## Idea 3: Claude API key or ChatGPT key instead of CLI login

Split into separate cases, they differ a lot.

### 3a. User brings Anthropic API key (allowed)

- Bridge sets `ANTHROPIC_API_KEY` for the agent SDK / claude CLI. Works today with no big change.
- Key stays on the user's machine (entered into the bridge config, not sent to your cloud). Do not store user keys in your database. Do not proxy them through your server.
- Optional "lite" mode: browser calls the Anthropic Messages API directly with the user's key (Anthropic supports browser access via an explicit opt-in header). No backend needed, so it works on any device. But no file access, no terminal, no Claude Code tools. Good for an agent "studio" with prompts only, not full Claude Code.
- User pays Anthropic per token. You charge only for the UI. Clean model.

### 3b. Claude Pro/Max subscription login through your site (do not build)

- Anthropic's terms and Agent SDK guidance do not allow third-party products to offer claude.ai login or route consumer subscription usage through their app. Third-party apps are expected to use API key auth. Enforcement has been active against subscription-token reuse.
- Safe pattern: the user runs their own already-logged-in `claude` CLI on their own machine, and your UI only drives it locally (this is what the project does now). Do not extract, store, or forward subscription OAuth tokens.
- Re-read current Anthropic Usage Policy and Agent SDK docs before launch. Terms change. Get legal review if you advertise "use your Claude subscription".

### 3c. Hosted execution for users without any backend

- Only possible with cloud sandboxes (per-user containers with a filesystem and the claude CLI/SDK). Needs sandbox vendor (E2B, Modal, Fly Machines, Daytona) or own k8s, plus API-key billing, abuse controls, secrets handling, and isolation.
- Costs: compute, storage, support, and security incidents become yours. Margin is thin unless you resell tokens, and reselling has its own terms and compliance load.
- Different product. Not recommended for MVP.

### ChatGPT / OpenAI

- "ChatGPT token" in practice means one of: an OpenAI API key (fine), or ChatGPT subscription login via Codex CLI (same third-party restriction logic as 3b: only the user's own local CLI, never through your service).
- OpenAI API alone gives chat and tool-calling but no coding-agent harness (file edit, shell, permissions). You would build one. Better to wrap a CLI that has it (Codex CLI, opencode).

## Idea 4: Codex CLI / opencode CLI

- Existing seam: `ProviderAdapter` in `server/utils/providers/types.ts`. `query()`, `interrupt()`, `normalizeMessage()`, `fetchHistory()`, `respondToPermission?()`. Add one adapter per provider and register it in `registry.ts`. `NormalizedMessage` stays the UI contract.
- opencode (best lever): one adapter covers many model providers (Anthropic, OpenAI, Google, local models, and more) through its own provider config. Has `opencode run --format json` and `opencode serve` with an HTTP + SSE API. The repo plan already lays out phases: `docs/plan-opencode-integration.md`. Recommend Option B there (sidecar `opencode serve`).
- Codex CLI: separate adapter. Check its non-interactive and JSON event modes for streaming. Auth is the user's own (API key or their ChatGPT login) on their own machine.
- Open design points:
  - Model registry is alias-based (`sonnet/opus/haiku`). Multi-provider needs `provider/model` strings. Registry rule in `CLAUDE.md` says no inline model strings. Extend `app/utils/models.ts` and `server/utils/models.ts` to a provider-aware shape.
  - Permission models differ (Claude `allowed-tools` vs opencode `permission` globs). Map explicitly, never silently.
  - Pricing/cost tracking per provider. Unknown pricing shows a neutral badge.
  - Provider capability flags already exist in `ProviderInfo` (`supportsPermissions`, `supportsImages`, `supportsInterrupt`). UI must hide unsupported controls.
- This work is valuable even without monetization: it widens the audience and is a clear paid differentiator ("one UI for all coding agents").

## Phased plan

Effort in focused dev days, one developer. Rough, not commitments.

| Phase | Scope | Effort |
|---|---|---|
| 0. Validate | Landing page + waitlist + 5-10 user interviews. Decide price. Check tax/payment setup for your country | 2-3 days |
| 1. Bridge hardening | Bind 127.0.0.1 by default, token pairing, origin/Host checks, CORS allowlist, `/api/health` + version endpoint | 3-4 days |
| 2. Frontend split | `useApi()` base-URL layer, SPA build (`nuxt generate`), connection settings screen, error states for disconnected backend | 4-6 days |
| 3. Accounts + billing | Auth provider, subscription, webhook, gating, single-session enforcement with heartbeat, account page | 5-8 days |
| 4. Remote VPS path | docker-compose with Caddy + token, docs, connectivity checker in UI | 2-3 days |
| 5. Providers | opencode adapter first, then Codex CLI, model registry refactor | 8-15 days |
| 6. Launch prep | Security review, CSP, terms/privacy, docs, Safari/Chrome LNA testing, status page | 4-6 days |

MVP = phases 1-3 (about 2.5-3.5 weeks). Phase 0 first.

## Risks summary

1. Security: hosted site controlling a local shell is high impact if compromised. Needs real hardening and a clear trust story.
2. Terms of service: never handle consumer subscription tokens for Claude or ChatGPT. API keys or the user's own local CLI only.
3. Competition: official Anthropic tooling and free community UIs. Differentiate on multi-provider, agent/workflow management, and analytics.
4. MIT license: free self-hosting is allowed and expected. Monetize hosting, convenience, sync, and add-ons.
5. Browser constraints: Safari localhost blocking, Chrome Local Network Access prompts. Need compatibility testing and fallback docs.
6. Support load: users with misconfigured local setups, TLS on VPS, firewalls. Good setup docs and a connection diagnostic page reduce this.
7. Payments and tax: pick a provider that supports your country, consider merchant of record.

## Open questions for the owner

- Keep the repo fully MIT and sell hosting only, or move new paid features into a separate closed module?
- Target users: solo developers, or teams? Teams need shared configs and roles, which changes the backend a lot.
- Selling entity and country for payments (affects Stripe vs merchant of record).
- Is a relay/tunnel service (zero-setup connection for users) in scope later? It changes the privacy and cost profile.

## Suggested next step

Run Phase 0 (waitlist + interviews) in parallel with Phase 1 (bridge hardening). Hardening is useful regardless of outcome, because the server currently has no auth and binds `0.0.0.0`.
