# ADR 0015: Host the UI on Vercel, reach the local server through an outbound relay

- Status: Proposed
- Date: 2026-11-07

## Context

The app is a GUI over `~/.claude`. Every server route needs the local machine: file CRUD under `CLAUDE_DIR`,
`node-pty` terminals, the Agent SDK, chokidar watchers and launchd schedules. None of that can run on Vercel.
Vercel functions are stateless and short-lived. They also cannot hold a WebSocket server.

The goal is to open the UI from a public URL, also from a phone or another machine, while the work still runs
on the laptop. Slack socket mode is the model: the local side dials out, so there is no inbound port and no tunnel.

Client transports in use today:

- About 39 `$fetch('/api…')` calls and 2 `useFetch` calls.
- WebSocket in `useTerminal.ts` (`server/api/cli/ws.ts`) and `useChatV2Handler.ts` (`server/api/chat/ws.ts`).
- SSE from `server/api/chat.post.ts`, and `EventSource` in `app/pages/logs.vue`.

The sibling project `claude-code-chatbox-ui` already picked Ably for the same pattern. Its traffic is chat only.

## Decision

Split the app into three parts.

```
Browser (Vercel SPA) ──wss──► Relay (Cloudflare Worker + Durable Object) ◄──wss outbound── Connector
                                                                                             │ http/ws
                                                                                             ▼
                                                                            Local Nitro server, 127.0.0.1:3030
```

1. **Vercel** serves a static SPA: `ssr: false` and `nuxt generate`. Nothing from `server/` is deployed there.
2. **Relay** is a Cloudflare Worker with one Durable Object per user. It holds two sockets and pipes frames
   between them. It uses hibernating WebSockets, so idle sockets cost close to nothing.
3. **Connector** is a small local process next to the Nitro server. It opens `wss://<relay>/agent`, then replays each
   request against `http://127.0.0.1:3030`. The Nitro server stays as it is.

The client uses one transport plugin. Local mode calls `/api` as today. Remote mode sends everything over the relay.
A custom `$fetch` instance (`ofetch.create`) keeps the call sites unchanged.

### Wire protocol

All traffic goes over one socket per side as JSON envelopes. Binary bodies are base64 or sent as binary frames.

```ts
{ id, kind: 'http', method, path, headers, body }            // browser -> connector
{ id, kind: 'http-res', status, headers, body }              // connector -> browser
{ id, kind: 'stream-chunk' | 'stream-end', data }            // SSE: chat.post.ts, logs
{ id, kind: 'ws-open' | 'ws-msg' | 'ws-close', path, data }  // virtual channels: cli/ws, chat/ws
{ kind: 'hello' | 'ping' | 'pong' | 'presence', ... }        // control
```

- `id` correlates the request and the response, so many requests share one socket.
- The browser sees `presence` and shows "daemon offline" when the connector is not connected.
- A request with no answer within a timeout fails on the client. Streams have no timeout, only heartbeat checks.

### Security

This design puts a remote shell on the internet. The PTY terminal, writes to `~/.claude` and agent runs amount to
remote code execution on the laptop. The following are required, not optional:

- Login on the Vercel app (Vercel password protection or Auth.js).
- Device pairing. The connector shows a one-time code. The browser enters it, and both sides store a long-lived token.
- The relay links a browser and a connector only when both tokens belong to the same user.
- End-to-end encryption. A key comes out of pairing (WebCrypto, AES-GCM). The relay only passes ciphertext.
- The connector keeps a route allowlist. Risky routes (`cli/ws` terminal, `reveal`, schedule writes) are off for remote
  use until turned on locally.
- The Nitro server binds to `127.0.0.1` only. The connector is its only remote entry point.
- Rate limits and connection caps per user in the Durable Object.

## Options considered

- **Ably instead of a Durable Object.** No relay code, built-in token auth, presence, reconnect and channel cipher.
  It is rejected here because of its small message size cap (about 64 KiB) and its per-channel rate limits.
  PTY output, `local-image` and large JSONL history reads would need chunking and batching.
  Pub/sub also makes request/response more work than a raw socket. Ably still fits `claude-code-chatbox-ui`.
- **Direct calls to localhost.** The Vercel SPA calls `http://127.0.0.1:3030` with a CORS allowlist and a bearer token.
  Chrome's Local Network Access asks once for permission. There is no relay, but it only works on the same machine.
  We keep it as phase 2, a cheap step on the way.
- **Tailscale or Cloudflare Tunnel with Access.** Needs no code change. It needs a VPN client or an Access policy
  on every device, and there is no app login. This is the fallback if the relay is not worth the effort.
- **Fly.io or Railway Node relay.** Works, but it is a server that runs all the time, with no hibernation.

## Implementation plan

1. SPA build and transport plugin, local mode only. No behavior change. Typecheck and click through the main pages.
2. Direct-to-localhost mode: CORS allowlist for the Vercel domain and a bearer token on the Nitro server.
3. Relay Worker and Durable Object, plus the connector. Plain HTTP envelopes first.
4. SSE envelopes (`chat.post.ts`, logs page).
5. WebSocket virtual channels (`cli/ws`, `chat/ws`).
6. Pairing, end-to-end encryption, route allowlist, presence UI.
7. Deploy: Vercel project for the SPA, `wrangler deploy` for the relay, launchd plist for the connector.

## Open questions

- Should the connector live inside the Nitro process (a Nitro plugin) or run as its own process? A separate process
  keeps the server untouched. A plugin means one less thing to start.
- Should the SPA go on Cloudflare Pages instead of Vercel? Then there is one vendor and the relay is on the same domain.
- Check the current Cloudflare free tier: support for SQLite-backed Durable Objects and how WebSocket messages are billed.
- Large uploads and downloads: send them as chunked envelopes, or as signed R2 URLs?

## Consequences

- The server code stays local and unchanged. The new parts are the transport plugin, the connector and the relay.
- There are two deploy targets (Vercel and Cloudflare) and one more local process to keep running.
- Every new route or socket has to work through the transport plugin. Raw `fetch('/api')` or `new WebSocket` calls
  only work in local mode.
- Remote mode is only as safe as pairing and the allowlist. A leaked token means shell access to the laptop.
