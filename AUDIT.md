# Cortex — Product Audit (May 2026)

This is the post-implementation audit. The original gap analysis (May 2026)
listed 4 P0 items, 4 P1 items, and 4 P2 items. After four engineering
sprints all P0 and P1 work is in `main` and live on devnet. What remains
is mainnet rollout and a small set of post-launch ideas.

---

## Status snapshot

- **Devnet program (v2) live** at [`DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV`](https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet).
- **IDL on-chain** at `DiQLhn84rRhxz38MNNu4DKJRrZD12kFYCp69KnLUVaR`.
- **12 skills registered**, multiple agent wallets, real settles in Solscan.
- **`cortex-sdk` workspace package** with LangChain, Vercel AI SDK, MCP, and gateway adapters.
- **Phantom / Solflare wallet UI** at `/agent` with deposit, withdraw, limits, tx history, devUSDC faucet.
- **First live skill** at `/api/skills/cortex-search`, backed by Tavily, payment-gated by `cortex-sdk/gateway` middleware.
- **`cortex publish` CLI** with idempotent register/update/deactivate/close, optional `verify_url` provenance.
- **Author dashboard** at `/authors/[pubkey]`.
- **Mainnet checklist** at `docs/MAINNET.md` (Squads 2-of-3, `solana-verify`, IDL on-chain, monitoring).

---

## Competitive landscape

The closest commercial work in the agent-payment space, with what each
ships today:

| Project | Stage | x402 settle | On-chain skill registry | On-chain spending caps | Trust score | Token / fee |
| --- | --- | --- | --- | --- | --- | --- |
| **Cortex** | devnet, v2 live | yes (own settler) | yes (Anchor PDA per slug) | **yes (`per_call_limit` + `daily_limit` enforced by program)** | no | none |
| [Aegis Place](https://github.com/aegisplaceprotocol/aegisplace) | mainnet-ready | yes | yes | off-chain | NVIDIA NeMo trust | 10% protocol fee |
| [$SKILL / OpenClaw](https://www.skillmarket.space/) | mainnet, live | yes | yes | no | no | $SKILL token, 70/20/10 split |
| [mcpay.tech / Frames Registry](https://registry.mcpay.tech) | live, multi-chain | yes | partial | off-chain custodian | no | per-call |
| [SVM x402 Facilitator](https://docs.svmacc.tech/x402/ai-agent.html) | live infra | yes | n/a | n/a | n/a | none |

### Reading

x402 settlement on Solana is no longer a moat. Solana Foundation's own
docs ([solana.com/docs/payments/agentic-payments](https://solana.com/docs/payments/agentic-payments))
evangelise the standard, and four projects already implement it.

A "skill marketplace on Solana" is also taken. SkillMarket has a
bonding-curve token; Aegis has trust scoring and royalty cascades. Both
ship more polish on day one.

What is *not* taken: an on-chain spending policy strong enough to
actually contain a compromised agent runtime. Every other stack treats
the runtime as trusted.

---

## The wedge

Cortex isn't out-featuring Aegis or SkillMarket. The defensible angle
is narrower:

1. **On-chain enforced spending policy.** If an agent is jailbroken
   (prompt injection, leaked key, escaped sandbox), our `daily_limit`
   stops the loss at the chain layer. Aegis and SkillMarket caps, if
   present, are off-chain trust assumptions. This is the strongest
   pitch for security-conscious buyers (financial agents, enterprise,
   devops automation).
2. **No platform tax. No token. Open-source.** SkillMarket takes 30%
   (10 protocol + 20 stakers). Aegis takes a cut. Cortex takes 0.
   Cortex is a rail, not a toll booth. Same positioning as USDC vs
   Coinbase: utility, not platform.
3. **Composable primitive.** The `AgentWallet` PDA can be the wallet
   for any other marketplace. Aegis or SkillMarket can build on top
   of Cortex without forking. Infrastructure, not a competing app
   store.

These claims are real but narrow. They survive scrutiny only because
the SDK, wallet UI, MCP adapter, and gateway shipped alongside the
program. A program without those is only an attestation.

---

## Implementation status against the original gap list

### P0 — Required for the product to exist

| ID | Gap | Status |
| --- | --- | --- |
| P0.1 | `cortex-sdk` npm package with `payForCall`, `discoverSkills`, `getWalletState` | done (Sprint 1) |
| P0.2 | Wallet UI: Phantom connect, Create / Deposit / Withdraw / Limits, balance, tx history | done (Sprint 2) |
| P0.3 | Skill HTTP gateway: `pay_for_call` + HTTP request + payment-header proof | done (Sprint 1 + Sprint 3) |
| P0.4 | Real LLM demo agent with LangChain + Anthropic | done (Sprint 1) |

### P1 — Table stakes vs Aegis / SkillMarket

| ID | Gap | Status |
| --- | --- | --- |
| P1.5 | Anti-squatting: `cortex.toml` provenance + idempotent CLI | done (Sprint 4) |
| P1.6 | MCP adapter for Claude Desktop / Cursor / Cline | done (Sprint 3) |
| P1.7 | `cortex publish` CLI with publish / inspect / deactivate / close | done (Sprint 4) |
| P1.8 | Author dashboard `/authors/[pubkey]` | done (Sprint 4) |

### P2 — Nice to have

| ID | Gap | Status |
| --- | --- | --- |
| P2.9 | Skill rating / reviews | open, post-launch |
| P2.10 | Mainnet deploy | open, blocked on Squads multisig setup |
| P2.11 | Skill bundles (compose paid skills) | open, post-launch |
| P2.12 | Spend-policy plugins (allowlists, time-of-day) | open, post-launch |

### P3 — Long tail

13 (trust scoring), 14 (royalty cascades), 15 (mobile Phantom flow) — all open, post-launch.

---

## Security audit — Anchor program

Re-read of [`programs/cortex_program/src/lib.rs`](./programs/cortex_program/src/lib.rs)
with a security hat on.

### Strengths

- All owner-gated ix carry `has_one = owner @ Unauthorized`.
- All author-gated ix carry `has_one = author @ Unauthorized`.
- `pay_for_call` checks `agent_wallet.agent == agent.key()`. An attacker can't drain another agent's wallet with their own signature.
- Mints validated everywhere via explicit `constraint`.
- All counters use `checked_add`, no overflow path.
- Daily reset uses `saturating_sub` against on-chain clock.
- PDA seeds are explicit and unique.
- v2 added `close_agent_wallet` and `close_skill` so rent isn't trapped forever.
- v2 normalises slugs to lowercase ASCII / digits / `-` / `_` so indexers and PDA-derivers can't disagree on canonical capitalisation.

### Findings

| ID | Severity | Issue | Mitigation |
| --- | --- | --- | --- |
| S1 | Med | Slug squatting (no on-chain author verification) | `cortex publish` CLI + optional `verify_url` (done in v2) |
| S2 | Low | No `close_agent_wallet` / `close_skill` in v1 | added in v2 |
| S3 | Low | Daily window is rolling-from-creation, not UTC midnight | documented; could add `align_to_utc` flag |
| S4 | Low | No `rotate_agent`. Owner has to close + recreate if a key leaks | open, candidate for v3 |
| S5 | Info | v1 slug validation permitted uppercase + symbols | normalised in v2 |
| S6 | Info | No `Withdrawn` event in v1 | added in v2 |
| S7 | Info | No admin pause for emergency halt | open, candidate before mainnet |
| S8 | Info | `manifest_uri` not validated as URL | off-chain consumers must validate |

For a hackathon submission the program is clean. Before mainnet, S4 and
S7 are worth adding; everything else is documented or already mitigated.

---

## Pitch positioning

**One-liner.** Cortex is the programmable wallet primitive for AI agents
on Solana. USDC for agents, not an App Store.

**Why now.** x402 standardised the settle. The marketplace layer is
becoming commodity (Aegis, SkillMarket). The wallet layer — programmable
spending policy enforced on-chain — is where security and composability
sit, and it is unclaimed.

**Why us.** Solo, ship velocity, opinionated about open-source and
tokenless. Cortex isn't trying to out-marketing a $SKILL token airdrop;
the bet is to out-engineer competitors on safety and composability and
be the rail every marketplace runs on.

**Risks.**

- Aegis adds on-chain spending caps in their next release. The wedge narrows.
- Solana Foundation ships a "wallet primitive" reference implementation. Cortex gets squeezed.
- Mitigation: keep shipping. The SDK, MCP adapter, and gateway are now in agent runtimes the moment a developer reaches for one.

---

## Sprint log

### Sprint 1 (Sprint 1 — Real agent SDK)
- `cortex-sdk` workspace package with the `Cortex` high-level facade.
- `cortex-sdk/langchain`, `cortex-sdk/ai-sdk`, `cortex-sdk/gateway` adapters.
- `demo-agent` rewritten: smoke mode + Anthropic LangChain mode.

### Sprint 2 (Wallet UI)
- `@solana/wallet-adapter-react` + Phantom + Solflare on the dashboard.
- `/agent`: connect, create, deposit, withdraw, update limits, tx history, devUSDC faucet.

### Sprint 3 (MCP adapter + first live skill)
- `cortex-sdk/mcp` package serving every skill over stdio MCP.
- `cortex-search-live` skill backed by Tavily, gated by `cortex-sdk/gateway` middleware.

### Sprint 4 (Program v2 + author tooling + mainnet readiness)
- Anchor program v2: `close_agent_wallet`, `close_skill`, `Withdrawn` event, slug normalisation.
- `cortex publish` CLI with `cortex.toml` and idempotent updates.
- Author dashboard at `/authors/[pubkey]`.
- `docs/MAINNET.md` 10-section deploy and verification checklist.

---

_Audit author: Cortex engineering session, May 2026._
