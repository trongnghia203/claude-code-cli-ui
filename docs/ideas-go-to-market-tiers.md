# Ideas: How We Sell the Product and Services

Date: 2026-10-11
Status: hypotheses to validate, nothing built or priced yet
Related: `docs/ideas-monetization-hosted-frontend.md` (technical feasibility), `docs/plan-opencode-integration.md` (multi-provider plan)

All prices, costs and conversion numbers below are assumptions to test, not market data. Check current vendor prices before using them.

## Decisions so far

- Drop MIT for new work. Free tier plus paid features. Existing published MIT copies stay MIT.
- Offer several ways to connect UI and backend: dedicated cloud machine (PaaS), hosted UI plus customer backend (hybrid), and API-key mode.
- Sell custom support services (repo setup and similar) on top.

Licensing to-do before launch:
- Check `CONTRIBUTING.md` and git history for outside contributors. Get a CLA or keep their code under MIT and isolate it.
- Choose: source-available license (FSL or BSL, converts to open source after a delay) for the whole repo, or open core (free core, closed paid modules). Open core is simpler to explain. Source-available protects the whole product.
- Get a lawyer to review license text, terms of service and privacy policy.

## Decisions update (2026-10-11)

1. Closed source. No open repo, no open core. Whole product is proprietary.
2. First market: Vietnam.
3. First customer: solo developers.
4. Delivery: owner does services personally at first. Employees or partners later.
5. Desktop app is acceptable, if it ships as a ready-built binary package and enforces an active license.

What this changes in the plan above:

- Primary client becomes the **desktop app** (mode B). It bundles UI and backend, so no hosted-UI-to-localhost problems (Safari, Local Network Access, hosted-site-compromise risk). Mode A (hosted web to local bridge) is demoted to optional or dropped. Hosted web is only needed for account, billing and license pages.
- Tiers in scope now: **Free (limited, closed-source binary) and Pro**. Team, Dedicated and Self-hosted licensed are deferred until Pro has paying users.
- Services stay as the early cash source, sized for one person (see capacity rule below).
- Self-hosted Docker image and BYOC VPS stay as later options. Desktop app can still connect to a remote bridge for users who want a VPS.

### Closed source: what it means

- Make the GitHub repo private. Existing public copies and forks of the MIT-era code stay MIT. Nothing can undo that, so the paid product must be clearly ahead of the last public version (new features only in the closed build).
- Contributors: check history. If outside contributors exist, get written permission or rewrite their parts.
- Add EULA, terms, privacy policy. Get a lawyer to check them, ideally one who knows Vietnamese and international software licensing.
- Dependencies: confirm all third-party licenses allow closed-source redistribution (MIT/Apache are fine, GPL/AGPL are not). Check `@anthropic-ai/claude-agent-sdk` license and redistribution terms in particular, since it will be bundled in the binary. Same for any provider SDK or CLI you bundle (opencode, Codex CLI). If not redistributable, make the app detect and use the user's own installed CLI instead of bundling it.

### Desktop app and license enforcement

Honest limits first: no desktop license is unbreakable. JavaScript in Electron or a Tauri webview can be unpacked and patched. Goal is to make cracking more work than paying, and to tie real value to things a crack cannot copy.

Design:
- Packaging choice:
  - Electron: easiest, Node is built in, works with `node-pty` and the Claude agent SDK. Larger download (about 100+ MB). Code in an asar archive is easy to read.
  - Tauri: smaller binary, Rust core is harder to patch, but the existing Node backend must run as a bundled sidecar (compile Node app to a single binary, for example with Bun compile or Node SEA). More integration work and risk with native modules.
  - Recommendation: start with Electron to ship fast, since the code is Node already. Revisit Tauri only if size or security matters to users.
- License flow:
  - User signs up and pays on the website. Gets a license key (or signs in inside the app).
  - App activates online: sends key plus device fingerprint, receives a signed license token (Ed25519 signature, public key embedded in app).
  - Token includes plan, expiry (for example 30 days), device id. App verifies signature offline and refreshes online in the background.
  - Offline grace period (for example 7 days) so a flaky connection does not lock out paying users.
  - 1 device at a time: activation on a new device deactivates the old one. Allow a limited number of transfers per month. Provide a self-service "deactivate device" page.
  - Subscription end or payment failure: token stops refreshing, app drops to Free limits after the grace period. Never delete user data.
- Make a crack costly, not only checks at startup:
  - Check license in several places, not one boolean. Gate premium features in the server (bridge) code path.
  - Put real value behind the account: config sync, hosted updates, cloud backup of configs, shared library, support access. A cracked binary cannot reach these.
  - Obfuscate or bytecode-compile the main process code (for example V8 snapshots or bytenode) as a speed bump. Do not rely on it.
  - Ship updates often so cracked builds go stale.
- Signed releases and updates:
  - macOS: Apple Developer account, code signing and notarization. Windows: code signing certificate (check current options and prices, including cloud signing services). Linux: AppImage or deb with checksums.
  - Auto-update with signature verification (`electron-updater` or Tauri updater). Host builds on object storage (for example Cloudflare R2) and gate downloads of paid builds by license.
- Native modules: `node-pty` needs per-platform builds (mac arm64/x64, Windows, Linux). CI matrix needed. Test on each OS. Windows terminal support (ConPTY) needs explicit testing, since many Vietnamese developers use Windows.
- Privacy: telemetry opt-in only, never send prompts, files or keys. State this in the privacy policy. API keys stay in the OS keychain on the user's machine.
- Platform priority: check what Vietnamese solo developers use (likely Windows plus macOS, some Linux). Do not ship macOS only.

### Vietnam-first notes

Verify each item before acting. These are my assumptions.

- **Payments.** Stripe likely does not onboard Vietnam-based businesses directly. Options to check:
  - Local gateways: PayOS, VNPay, MoMo, ZaloPay, VietQR bank transfer. Good for VND, low friction for local users. Need a registered business or sole-proprietor setup for some of them.
  - Merchant of record (Paddle, Lemon Squeezy, Polar, others): sell globally, they handle tax. Check whether they can pay out to a Vietnam bank account and their fees.
  - Practical start: VietQR or bank transfer plus manual license issue for the first 10-20 customers, then a gateway. Slow but needs no integration.
  - Check Vietnamese tax and invoicing rules (e-invoice requirements, VAT, personal income versus company). Talk to an accountant before the first sale.
- **Pricing in VND.** Solo developers in Vietnam are price sensitive. Test Pro around 99,000-199,000 VND per month or 990,000-1,990,000 VND per year, with an early-supporter lifetime or founder price. Services priced lower than the USD table, for example Quick start 500,000-1,500,000 VND and Repo setup pack 2-6 million VND. Higher prices for Vietnamese outsourcing companies and agencies later (they are Team tier and can pay more).
- **Model access friction.** Check that Anthropic API and OpenAI API accept Vietnam billing and phone numbers today. Many local developers hit card and verification problems. This is also a chance: a setup service that gets users working (card, key, config), and opencode support, which works with many other providers and cheaper models. Do not resell tokens or share keys (terms).
- **Language.** Vietnamese UI option, Vietnamese docs and onboarding videos. Strong differentiator versus global tools.
- **Channels in Vietnam.** Facebook groups for AI and programming, Zalo groups, Voz, Viblo, Tinhte, TikTok and YouTube Vietnamese dev creators, local meetups and university groups, outsourcing companies. Offer demo sessions and a small affiliate share to creators.
- **Trust.** Local users may fear piracy-style cracked tools and hesitate to pay for a new product from an unknown seller. Free tier, clear refund policy, a visible founder, and local support in Zalo or Messenger help.
- **Piracy.** Software piracy is common in the region. Expect cracks. Lean on account-tied value and low price rather than strict DRM.

### Solo-developer scope

- Free: limited closed-source binary. Suggested limits: for example a cap on number of agents or workflows, no schedules, no multi-provider, no sync. Test which limits convert.
- Pro: unlimited agents and skills, schedules, usage and cost analytics, multi-provider (opencode first), config sync and backup, 1 device at a time, priority support in Vietnamese.
- Do not build team features yet.

### Owner capacity rule (services done by one person)

- Cap services at a fixed number of slots per month (for example 4-6 Quick start and 2 Repo setup packs). Hours not sold go to product.
- Track hours per sale. Raise prices when the slots stay full.
- Record every delivery as a template or script. The goal is that a repeated service becomes a product feature or a recorded video.
- Say no to custom work outside the catalog until a partner or employee exists.
- Hire or partner after services have a waiting list: first a part-time delivery helper for Quick start and Repo setup, with your checklists.

## What we sell

Three things, in this order of importance for early revenue:

1. Services: done-for-you setup and support. Fastest cash, validates who pays.
2. Product subscription: hosted UI, accounts, paid features. Scales.
3. Managed infrastructure: dedicated machine per customer. Premium tier.

## Product tiers

| Tier | Who | What they get | Where agent runs | Our ops load |
|---|---|---|---|---|
| Free | Hobbyists, trial | Self-hosted free core: local agent/skill/command CRUD, terminal, chat | User's machine | None |
| Pro (hybrid) | Solo developers | Hosted UI, login, 1 device, config sync, usage and cost analytics, schedules, multi-provider (Claude, OpenAI, opencode) | User's machine or user's VPS | Low |
| Team | Small teams | Pro plus shared configs, roles, shared agent/skill library, audit log, several devices per seat pool | User machines or team VPS | Medium |
| Dedicated (PaaS) | Teams and companies wanting no setup | Dedicated cloud machine with backend + UI + monitoring, SSO optional, onboarding included | Our-managed VM in a region they choose | High |
| Self-hosted licensed | Companies with strict data rules | Docker image plus license key, on-prem, updates, support SLA | Customer infrastructure | Low-medium (support only) |

API-key mode is not a tier. It is an auth option in every tier: customer brings Claude, OpenAI or opencode provider keys. We never resell tokens and never handle consumer subscription logins (Claude Pro/Max, ChatGPT).

## Connection modes (how UI reaches the backend)

| Mode | Description | Best for | Main risk |
|---|---|---|---|
| A. Local bridge | Hosted UI talks to `localhost` bridge on user's laptop | Pro solo users | Safari localhost blocking, Chrome Local Network Access prompt, hosted-site-compromise risk |
| B. Desktop app | Tauri or Electron app bundles UI and bridge, license check inside app | Pro solo users, if mode A tests badly | Packaging, code signing, auto-update work |
| C. Customer VPS (BYOC) | Bridge on customer's cloud VM behind HTTPS with token | Pro/Team | Customer needs domain and TLS. Mitigate with our docker-compose + Caddy template and setup service |
| D. Dedicated machine (PaaS) | We provision and run VM per customer | Dedicated tier | We hold customer code and secrets. Security and compliance on us |
| E. Self-hosted licensed | Customer runs everything | Regulated customers | Piracy of license keys. Mitigate with signed keys and contracts |
| F. Relay (later) | Bridge dials out to our relay, browser connects through it | Zero-setup users | We are in data path. Needs end-to-end encryption |

Suggested focus: A or B for Pro (decide after a quick browser compatibility test), C as documented option, D as manual-first premium.

## Service catalog (productized)

Sell fixed-scope packages with fixed prices, not hourly consulting. Each has a checklist so delivery is repeatable.

| Service | Scope | Delivery | Price hypothesis |
|---|---|---|---|
| Quick start | Install bridge, connect UI, one repo, first agents and skills | 1-2 h call or async | $99-199 one-time |
| Repo setup pack | Per repo: CLAUDE.md, agents, commands, skills, MCP config, permission rules, test and lint hooks | 1-3 days | $300-900 per repo |
| BYOC VPS setup | Provision customer VM, harden, Caddy TLS, bridge, backups, token, docs | 0.5-1 day | $250-600 one-time |
| Dedicated machine onboarding | Provision our-managed VM, migrate their config, train team | 1-2 days | $500-1500 one-time |
| Workflow and agent design | Custom agents, workflows, schedules for their process (code review, release notes, triage) | 3-10 days | $1500-6000 per project |
| Team training | 2-4 h workshop on Claude Code and agent management practice | half day | $600-2000 per session |
| Support retainer | Priority chat/email, monthly config review, upgrade help | monthly | $150-600 per month |
| Security review | Permission model, secrets handling, MCP risk audit for their setup | 1-3 days | $800-2500 |

Rules for services:
- Customer owns their keys and data. We get temporary, revocable access only. Write this in every contract.
- Reuse delivery assets: template repos, agent packs, checklists. Every project should leave a reusable template behind.
- Convert services into product where repeated 3+ times (for example a recurring repo-setup step becomes a one-click feature).

## Pricing hypotheses (to test)

| Tier | Monthly | Yearly | Notes |
|---|---|---|---|
| Free | $0 | $0 | Self-host, no hosted UI |
| Pro | $9-15 | $90-140 | 1 device at a time |
| Team | $15-25 per seat, 3-seat minimum | discount ~15% | Shared library, roles |
| Dedicated | $79-199 per machine plus per-seat | custom | Includes onboarding credit, infra cost passes through |
| Self-hosted licensed | n/a | $1500-6000 per year per company | Support SLA tiers |

Anchors to compare against before fixing prices: official Claude tooling (free with their plans), community UIs (mostly free), and what customers already pay for their coding assistants. Our Pro price must feel small next to their model bill.

## Cost model sketch

Per Pro user (hybrid): near zero marginal cost. Static hosting, auth and billing webhook are low. Expect payment fees of roughly 3-6% plus fixed fee, higher with a merchant of record (but it handles tax).

Per Dedicated customer (illustrative, verify provider prices):
- VM 2-4 vCPU, 4-8 GB RAM: low tens of dollars per month at budget providers, more at AWS/Azure
- Disk, backups, bandwidth: a few dollars
- Monitoring and your time: dominant cost. Budget 1-2 h per customer per month for patching and support
- Result: Dedicated must be priced high enough that one customer covers VM plus several hours of support. Underpricing here kills margin.

Break-even thinking (fill in real numbers):
- Fixed costs: domain, email, monitoring, accounting, legal docs, security review
- Target: Pro revenue covers fixed costs first, services cover your living costs, Dedicated adds margin once repeatable

## How customers find us (channels)

1. Existing GitHub repo and README: add clear "Pro" and "Services" sections and a waitlist link. The free tier is the funnel.
2. Content: short posts and videos on managing Claude Code agents, skills and workflows, using the UI as the demo. Show before/after of repo setup.
3. Communities: Claude Code, opencode and AI coding communities, r/ClaudeAI, Hacker News launch, dev.to, YouTube. Be useful first, sell second.
4. Direct outreach for services: small dev teams and agencies already using Claude Code. Offer a free 30 minute setup audit that ends in a Repo setup pack quote.
5. Partners: freelancers and consultancies who resell our setup packs and get a referral share.
6. Marketplace: later, a paid pack store for agents, skills and workflows (creator revenue share).

## Sales motion

- Free and Pro: self-serve. Landing page, checkout, in-app onboarding. No human involvement.
- Services: short intake form, scoped quote in 1 day, 50% upfront, rest on delivery. Use a standard statement of work.
- Dedicated and Self-hosted: call, security questionnaire, pilot of 2-4 weeks, then annual contract.
- Upsell path: Free, then Quick start, then Pro, then Repo setup, then Team, then Dedicated or Retainer.

## Legal and trust checklist

- Terms: no handling of Claude Pro/Max or ChatGPT subscription tokens. API keys or the user's own local CLI only. Re-read provider terms before launch and before each new provider.
- We never store customer API keys in our cloud in Pro mode. Keys live on the customer's bridge.
- Dedicated tier: data processing agreement, region choice, encryption at rest, backup and deletion policy, incident process. Be honest about what we do not certify yet (SOC 2 and similar).
- Privacy policy, terms, refund policy, tax setup. Pick payment provider that supports the seller's country (check Stripe versus merchant of record such as Paddle or Lemon Squeezy).
- Security page describing the bridge trust model (origin allowlist, pairing token, localhost bind) and the hosted-site risk.

## Roadmap to first revenue

| Step | Output | Effort |
|---|---|---|
| 1. Offer page | Landing page, waitlist, service packages with prices, booking form | 2-3 days |
| 2. Sell 3-5 services manually | Quick start and Repo setup packs to people from communities and network. Learn what they ask for | 2-4 weeks, mostly outreach |
| 3. Bridge hardening | 127.0.0.1 default, token pairing, origin checks, health endpoint | 3-4 days |
| 4. Browser test | Check Safari, Chrome Local Network Access, Firefox against hosted UI to localhost. Decide mode A versus desktop app B | 1-2 days |
| 5. Pro MVP | Frontend split, accounts, billing, 1 device, API-key mode | 2.5-3.5 weeks |
| 6. Provider adapters | opencode first, then Codex CLI | 1.5-3 weeks |
| 7. Dedicated pilot | Terraform plus cloud-init template, 1-2 pilot customers, manual ops | 1-2 weeks |
| 8. Team features | Shared library, roles, audit log | later, driven by demand |

Step 2 can start before any code. It tests demand and funds the rest.

## Metrics to watch

- Waitlist signups and conversion to a paid service
- Services: number sold, average price, delivery hours (real hourly rate), repeat customers
- Pro: signups, free-to-paid conversion, monthly churn, active devices, support tickets per user
- Dedicated: monthly infra cost per customer, support hours per customer, margin
- Activation: time from signup to first working agent run
- Source of each lead (which channel works)

## Risks

1. Services do not scale. Keep a rule: each repeated service becomes a template or feature.
2. Official tools keep improving and free alternatives exist. Lead with multi-provider, management UI, analytics and team features.
3. Dedicated tier puts security and uptime duty on us. Start with few customers, written scope, and clear limits in contract.
4. Hosted UI controlling local machines is a security liability. Mitigate with hardening, signed releases and possibly the desktop app.
5. Relicensing can upset current users. Communicate early, keep a real free tier.
6. Single-person bandwidth. Pick one tier to push per quarter.

## Open questions

Resolved on 2026-10-11 (see "Decisions update"): closed source, Vietnam first, solo developers first, owner delivers services, desktop app with license enforcement is acceptable.

Still open:

- Legal form for selling in Vietnam (sole proprietor, household business, company) and which payment gateway accepts it. Ask an accountant.
- Redistribution rights for `@anthropic-ai/claude-agent-sdk` and any bundled CLI (opencode, Codex). If not allowed, detect the user's own install instead.
- Windows support level at launch. Many Vietnamese developers use Windows. Needs `node-pty` and shell testing.
- Free-tier limits that convert without making the free app useless.
- Founder or lifetime price: yes or no, and for how many early users.
- Which Vietnamese channel to start with (Facebook group, YouTube, Viblo, Zalo).

## Revised roadmap (after decisions)

| Step | Output | Effort |
|---|---|---|
| 1. Offer page (Vietnamese + English) | Landing, waitlist, service packages in VND, booking via Zalo or form | 2-3 days |
| 2. Sell 3-5 services manually | Quick start and Repo setup packs to Vietnamese developers. Take payment by bank transfer or VietQR | 2-4 weeks |
| 3. Legal and payment basics | Accountant call, business form, payment gateway choice, EULA and terms draft, dependency license check | 1-2 weeks, in parallel |
| 4. Make repo private, hardening | Private repo, bridge bound to 127.0.0.1, token between app UI and backend, health check | 2-3 days |
| 5. Desktop app MVP | Electron shell with bundled backend, Windows and macOS builds, signing, auto-update | 2-3 weeks |
| 6. License server | Accounts, key issue, activation, signed tokens, 1 device, grace period, deactivate page, payment webhook | 1-2 weeks |
| 7. Pro features and opencode adapter | Gate features, usage analytics, opencode provider, config sync | 2-3 weeks |
| 8. Public launch in Vietnam | Founder price, Vietnamese docs and videos, creators and communities | ongoing |
| 9. Later | Team tier, Dedicated pilot, Self-hosted licensed, partners | after paying users exist |

## Suggested next step

Start steps 1, 2 and 3 now: they need no code and test demand, price and payment setup. Step 4 can start at the same time because the backend has no auth today. Do not start the desktop app until at least a few people have paid for services or joined the waitlist with a price shown.
