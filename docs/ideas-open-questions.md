# Open Questions and Resume Notes

Date: 2026-10-12
Purpose: one place to resume the monetization work later. Read this first, then the linked docs.

Related docs:
- `docs/ideas-monetization-hosted-frontend.md` - technical feasibility (hosted UI, bridge, API keys, providers)
- `docs/ideas-go-to-market-tiers.md` - tiers, services, pricing, Vietnam notes, desktop license design, roadmap
- `docs/plan-opencode-integration.md` - opencode provider plan

## Decisions already made (do not re-open without reason)

1. Closed source. No open repo, no open core.
2. First market: Vietnam.
3. First customer: solo developers.
4. Owner delivers services personally at first. Employees or partners later.
5. Desktop app is acceptable as main client if shipped as a built binary with license enforcement.
6. Never handle Claude Pro/Max or ChatGPT subscription tokens. API keys or the user's own local CLI only.
7. In scope first: Free and Pro tiers. Team, Dedicated (PaaS), Self-hosted licensed come later.

## Where we stopped

- Feasibility and go-to-market docs written. No code changed.
- Next planned work (from revised roadmap): offer page, sell 3-5 services manually, legal and payment basics, make repo private and harden the backend. Desktop app starts only after demand shows.

## Open questions

Status: open = not decided. Blocks = roadmap step that cannot finish without the answer. "Verify" means the answer depends on facts I did not confirm from live sources.

### A. Business and legal

| # | Question | Why it matters | How to resolve | Blocks |
|---|---|---|---|---|
| A1 | Legal form for selling in Vietnam: sole proprietor, household business, or company? | Decides which payment gateways accept you, tax, invoices, contracts | Talk to a Vietnamese accountant. Ask about software subscription income, e-invoice rules, VAT, foreign income | Payments, first paid sale |
| A2 | Which payment method first: VietQR/bank transfer, local gateway (PayOS, VNPay, MoMo, ZaloPay), or merchant of record (Paddle, Lemon Squeezy, Polar)? | Needed to take money. Stripe likely unavailable for VN sellers (verify) | Check each provider's VN onboarding, payout to VN bank, fees, tax handling | Pro billing |
| A3 | Can `@anthropic-ai/claude-agent-sdk` and any bundled CLI (opencode, Codex) be redistributed inside a closed-source binary? | If not, binary cannot bundle them and must use the user's own install | Read each license and terms. Ask the vendor if unclear | Desktop app packaging |
| A4 | Are there outside contributors whose code is in the repo? | Closed-source relicensing needs their permission or rewrite | Check `git shortlog -sne`, PRs, `CONTRIBUTING.md`. Ask contributors or replace their code | Making repo private and relicensing |
| A5 | Are all third-party dependencies allowed in closed-source distribution (no GPL/AGPL)? | License violation risk | Run a license scan over the dependency tree | Desktop app release |
| A6 | EULA, terms, privacy policy, refund policy: who writes and reviews them? | Required before charging | Find a lawyer (VN plus international software licensing) or a reputable template plus review | Launch |
| A7 | Do Anthropic and OpenAI accept Vietnam billing, cards and phone verification today? | Decides how many users can get a key and what setup help is worth selling | Test the signup flow. Ask users. Check provider supported-country lists | Positioning of setup service |

### B. Product and pricing

| # | Question | Why it matters | How to resolve | Blocks |
|---|---|---|---|---|
| B1 | Free-tier limits: which limits convert without making the free app useless? | Core of free-to-paid funnel | Draft 2-3 variants (agent cap, no schedules, no multi-provider, no sync). Test with waitlist users | Pro feature gating |
| B2 | Founder or lifetime price: yes or no, how many users, what price? | Early cash versus long-term revenue | Decide after first service sales and waitlist size. Cap the count | Launch |
| B3 | Pro price in VND (hypothesis 99-199k/month, 990k-1.99M/year) | All numbers are assumptions | Show price on offer page to 10-20 target users, watch response | Billing setup |
| B4 | Service prices in VND (Quick start, Repo setup pack, etc.) | Same | Quote first 3-5 customers at different prices, record outcomes | Service launch |
| B5 | Windows support level at launch | Many VN developers use Windows. `node-pty` and shell paths need work | Survey early users on OS. Test ConPTY, PowerShell, WSL | Desktop app MVP scope |
| B6 | Vietnamese UI scope: full translation or key screens only? | Differentiator, but costs time | Decide per screen: onboarding and settings first | Public launch |
| B7 | Which features are Pro-only first: schedules, analytics, multi-provider (opencode), sync, backup? | Defines paid value | Rank by what interviewed users ask for | Pro MVP |

### C. Technical

| # | Question | Why it matters | How to resolve | Blocks |
|---|---|---|---|---|
| C1 | Electron versus Tauri for desktop app | Size, security, effort | Default Electron (backend already Node). Revisit if size or crack resistance becomes an issue | Desktop app MVP |
| C2 | License model details: token lifetime (30 days?), offline grace (7 days?), device transfers per month | Balance user friction versus abuse | Pick defaults, adjust after first users | License server |
| C3 | Where to host license server and website, and which auth provider | Cost, uptime, effort | Compare Supabase, Clerk, Cloudflare Workers plus D1. Prefer low-ops | License server |
| C4 | Code signing: Apple Developer account, Windows signing option and cost | Unsigned installers scare users and trigger OS warnings | Check current prices and cloud signing services | Desktop release |
| C5 | Remote backend support in desktop app (user VPS): in or out of MVP? | Extra connection mode, TLS and token handling | Leave out of MVP unless users ask | Scope |
| C6 | Backend has no auth and binds `0.0.0.0` today. Fix order? | Security | Bind 127.0.0.1, add token between app UI and backend, origin checks | Any release |
| C7 | Provider order: opencode first, then Codex CLI? Model registry refactor to `provider/model` | Multi-provider is the planned differentiator | Follow `docs/plan-opencode-integration.md` Option B | Pro features |
| C8 | Telemetry: none, or opt-in minimal (crash reports, activation count)? | Privacy promise versus product insight | Decide policy before writing privacy text. Never send prompts, files or keys | Privacy policy |

### D. Go-to-market

| # | Question | Why it matters | How to resolve | Blocks |
|---|---|---|---|---|
| D1 | First Vietnamese channel: Facebook groups, YouTube, Viblo, Zalo groups, Voz, TikTok, outsourcing companies? | Limited time, one channel at a time | Pick one, post useful content for 2-4 weeks, track leads | Step 2 (first sales) |
| D2 | Affiliate or creator share for Vietnamese creators? | Cheap reach | Decide percentage and tracking after first launch | Launch |
| D3 | Support channel: Zalo, Messenger, email, Discord? | Local users prefer Zalo or Messenger | Pick one main channel. Set response time promise | Services |
| D4 | Service slot cap per month (hypothesis 4-6 Quick start, 2 Repo setup) | Owner time is limited | Measure delivery hours in first sales, then set cap | Services |
| D5 | When to hire or partner for delivery, and with what split | Services do not scale alone | Trigger: waiting list for 4+ weeks. Start with part-time helper using checklists | Later |
| D6 | Dedicated (PaaS) tier: when to pilot, which cloud region and provider? | Premium tier, high ops load | Only after Pro has paying users. Start manual with Terraform and cloud-init | Later |
| D7 | Relay or tunnel service for zero-setup remote access: ever in scope? | Changes privacy, cost and liability | Defer. If done, use end-to-end encryption | Later |

## Facts to verify before relying on them

These statements in the docs came from general knowledge, not live checks.

- Stripe does not onboard Vietnam-based businesses directly.
- Merchant-of-record providers pay out to Vietnam bank accounts, and their fees.
- Anthropic usage terms: third-party products may not offer claude.ai login or route consumer subscription usage. Re-read current Usage Policy and Agent SDK docs.
- OpenAI terms for Codex CLI with ChatGPT login in third-party tools.
- Chrome Local Network Access prompt behavior and Safari localhost mixed-content behavior (only relevant if hosted-web-to-local mode is revived).
- Hosting, signing and payment prices quoted as ranges in the docs.
- Competitor landscape (official Claude Code desktop and web, community UIs). Re-check before pricing.

## Suggested resume order

1. Answer A1 and A2 (accountant call). They gate taking any money.
2. Run A4 and A5 (quick repo checks) and A3 (SDK redistribution). They gate closed-source release.
3. Build the offer page and quote services (B3, B4, D1). Start selling by hand.
4. Do C6 (backend auth and localhost bind) in parallel. Needed in every scenario.
5. After first paying customers: decide B1, B2, B5, then start desktop app (C1, C2, C3, C4).

## How to resume with Claude

Tell Claude: "Read docs/ideas-open-questions.md and the two linked ideas docs, then continue from 'Suggested resume order'." Update the Status or answers in this file as questions close. Move closed items into "Decisions already made".
