# Cortex — Honest Product Audit (May 2026)

> User's verdict: **5/10**. This document is brutally honest about why,
> what the competition already shipped, and what specifically needs to
> be built to get to **10/10**.

---

## TL;DR

1. The on-chain primitives **work** and are reasonably well-engineered.
   `pay_for_call` settles in one tx, daily/per-call caps are enforced
   on-chain, the program is small (537 lines) and auditable.
2. **Everything around the on-chain primitive is missing or fake.**
   No agent SDK, no wallet UI, no MCP adapter, no real LLM demo, no
   skill HTTP gateway, no anti-squatting. The `demo-agent` is a Node
   script that loops `pay_for_call` 10 times and prints mock strings.
3. The **field is crowded**. Aegis Place, SkillMarket / $SKILL,
   mcpay.tech and SVM-x402 facilitator all ship variants of "x402 on
   Solana for AI agents" right now. Some are mainnet, some are
   tokenized, some have trust scoring.
4. Our **only honest wedge** is: programmable spending policy enforced
   on-chain + open-source + tokenless. That is narrow but defensible
   if we lean into it.
5. To 10/10 we need **4 P0 items in 10–14 days**: real SDK, wallet UI,
   MCP adapter, real LLM demo. Everything else is polish.

---

## Competitive landscape (real, with links)

| Project                                                             | Stage             | x402           | On-chain skill registry | Programmable wallet caps                     | Trust score    | Token / fee                     |
| ------------------------------------------------------------------- | ----------------- | -------------- | ----------------------- | -------------------------------------------- | -------------- | ------------------------------- |
| **Cortex (us)**                                                     | devnet, 10 skills | ✅ own settler | ✅ Anchor PDA per slug  | ✅ on-chain `per_call_limit` + `daily_limit` | ❌             | ❌ none (good)                  |
| [Aegis Place](https://github.com/aegisplaceprotocol/aegisplace)     | mainnet-ready, 6★ | ✅             | ✅                      | ❓ off-chain                                 | ✅ NVIDIA NeMo | 10% protocol fee                |
| [$SKILL / OpenClaw](https://www.skillmarket.space/)                 | mainnet, live     | ✅             | ✅                      | ❌                                           | ❌             | ✅ $SKILL token, 70/20/10 split |
| [mcpay.tech / Frames Registry](https://registry.mcpay.tech)         | live, multi-chain | ✅             | partial                 | ❌ (off-chain custodian)                     | ❌             | per-call                        |
| [SVM x402 Facilitator](https://docs.svmacc.tech/x402/ai-agent.html) | live infra        | ✅             | n/a (just facilitator)  | n/a                                          | n/a            | none                            |

### What this means

- **x402 on Solana is no longer differentiating.** It's table stakes.
  Even Solana's own docs ([solana.com/docs/payments/agentic-payments](https://solana.com/docs/payments/agentic-payments))
  evangelise the standard. We are **not first**.
- **"Skill marketplace on Solana" is taken.** SkillMarket has a
  bonding-curve token, Aegis has trust scoring + royalty cascades.
  Both leapfrog us on UX polish and feature set.
- **Our naming collides** with mcpay.tech's "AgentWallet". We can keep
  the term (it's descriptive) but should be ready to explain
  difference in any pitch.

---

## Our honest wedge

We don't out-feature Aegis or SkillMarket. What we have that they don't:

1. **On-chain enforced spending policy.**
   - If an agent is jailbroken / escapes its sandbox, our daily cap
     stops it at the chain layer. Aegis/SkillMarket caps (if any) are
     trust-based, off-chain.
   - This is the strongest narrative for security-conscious buyers
     (enterprise, devops, financial).

2. **No platform tax. No token. Open-source.**
   - SkillMarket takes 10% to protocol + 20% to stakers.
   - Aegis takes a cut.
   - We take **0**. We're the rail, not the toll booth. Same pitch
     as USDC vs Coinbase: utility, not platform.

3. **Composable primitive.**
   - Our `AgentWallet` PDA can be the wallet _for any marketplace_.
     Aegis or SkillMarket could in theory build on top of us.
     We position as **infrastructure**, not as a competing app store.

These are real but **narrow**. They survive scrutiny only if we
actually ship the SDK, wallet UI and MCP adapter so people can use
the wedge.

---

## Honest list of dyrki (gaps)

### 🔴 P0 — Without these the product is demoware

1. **No agent SDK.** No installable npm package. `cortex-sdk` exists
   in the repo but isn't published. There's no `payForCall()` that
   does (a) on-chain settle + (b) HTTP call to manifest endpoint.
2. **No wallet UI.** Can't connect Phantom. Can't create wallet
   without Node script. Can't deposit USDC without `solana transfer`
   from CLI. Can't withdraw. Can't see balance for someone else's
   wallet.
3. **No skill HTTP gateway.** When you `pay_for_call`, the skill's
   actual API endpoint is **never called**. We're a settler, not a
   runtime. The "demo-agent" prints mock strings.
4. **No real LLM demo.** Demo agent is hardcoded slug list. No agent
   reasoning, no tool selection, no LangChain/AI SDK integration.

### 🟠 P1 — Table stakes vs Aegis / SkillMarket

5. **Anti-squatting.** Anyone can register `slug = "openai"` and
   collect payments. No author verification.
6. **MCP adapter.** Every Cortex skill should be discoverable as an
   MCP tool so it Just Works in Claude Desktop / Cursor / agentic
   IDEs. This is where the actual users live.
7. **`cortex publish` CLI.** Featured templates are static — no path
   for a real GitHub maintainer to claim → publish → earn.
8. **Author dashboard.** Authors can't see analytics (calls / day,
   revenue, top skills, churn). SkillMarket has this.

### 🟡 P2 — Nice to have

9. **Skill rating / reviews.**
10. **Mainnet deploy.**
11. **Skill bundles** (compose paid skills).
12. **Spend-policy plugins** (allowlists, rate limits, time-of-day).

### 🟢 P3 — Long-tail

13. **Trust scoring** (compete with Aegis on this axis).
14. **Royalty cascades** for derivative skills.
15. **Mobile Phantom / Solflare flow.**

---

## Security audit — Anchor program

Re-read [`programs/cortex_program/src/lib.rs`](./programs/cortex_program/src/lib.rs)
(537 lines) with a security hat on.

### Strengths

- ✅ All owner-gated ix have `has_one = owner @ Unauthorized`.
- ✅ All author-gated ix have `has_one = author @ Unauthorized`.
- ✅ `pay_for_call` checks `agent_wallet.agent == agent.key()` —
  prevents another agent's wallet from being drained with someone
  else's signature.
- ✅ Mints validated everywhere with explicit `constraint`.
- ✅ All counters use `checked_add` → no overflow path.
- ✅ Daily reset uses `saturating_sub` against on-chain clock.
- ✅ PDA seeds explicit and unique.

### Findings (severity-rated)

| ID  | Sev     | Issue                                                            | Mitigation                                    |
| --- | ------- | ---------------------------------------------------------------- | --------------------------------------------- |
| S1  | 🟠 Med  | Slug squatting (no owner verification)                           | GitHub `cortex.toml` + OAuth (P1.5)           |
| S2  | 🟡 Low  | No `close_agent_wallet` / `close_skill` — rent locked forever    | Add close ix in v2                            |
| S3  | 🟡 Low  | Daily window is rolling-from-creation, not UTC-midnight          | Document; or add `align_to_utc` flag          |
| S4  | 🟡 Low  | No `rotate_agent` — if key leaks, owner must withdraw + recreate | Add ix                                        |
| S5  | ℹ️ Info | Slug char validation permits uppercase + symbols                 | Normalize to lowercase                        |
| S6  | ℹ️ Info | No `Withdraw` event                                              | Add for off-chain accounting                  |
| S7  | ℹ️ Info | No admin pause for emergency halt                                | Add `program_paused` global state for mainnet |
| S8  | ℹ️ Info | `manifest_uri` not validated as URL                              | Off-chain consumers must validate             |

**Verdict:** for a hackathon MVP, the program is **clean**. Before
mainnet we should fix S1 (squatting) and add S2/S4 instructions.

---

## UX flows — answers to your questions

### How do agents _actually_ use Cortex?

```ts
// 1. Developer installs
npm i @cortex/sdk

// 2. Agent runtime gets agent keypair (one-time setup via dashboard)
import { Cortex, agentFromMnemonic } from "@cortex/sdk";
const cortex = new Cortex({
  rpc: process.env.SOLANA_RPC,
  agent: agentFromMnemonic(process.env.AGENT_MNEMONIC),
});

// 3. LangChain integration: each skill becomes a Tool
import { CortexTool } from "@cortex/sdk/langchain";
const tools = await cortex.discoverSkills(["search", "summarize"]).then(
  skills => skills.map(s => new CortexTool(s))
);
const agent = createOpenAIToolsAgent({ llm, tools, prompt });

// Now agent autonomously: chooses skill → SDK settles on-chain
// → SDK calls manifest_uri with X-Cortex-Payment header proving the
//   settle tx → response returned → agent reasons over it
```

### How do users top up the wallet?

**Today:** Node script only. ❌
**P0:** Phantom-connect "Deposit USDC" button on `/agent`. The form
takes amount → builds an SPL transfer from owner's ATA into the
`agent_vault` PDA → user signs once with Phantom → confirmed.
**Fund-with-Solana-Pay** is the secondary flow for non-Phantom users.

### How do skills get authenticated (anti-squat)?

**Today:** zero verification — anyone can claim `slug = "openai"`.
**P0.5:** `cortex publish` CLI:

1. Author writes `cortex.toml` in repo root with `solana_pubkey`.
2. `cortex publish` does GitHub OAuth → checks file exists in main
   branch → constructs `register_skill` ix → user signs → on-chain.
3. Front-end shows ✅ "Verified GitHub author" badge tied to the
   commit hash that proved ownership.

**Why this is enough for MVP:** GitHub auth is free, gives strong
"this person is who they claim" signal, and is the standard pattern
(Vercel/Netlify/Render all use it).

### How is squatting prevented after MVP?

- **A:** First-come-first-served + GitHub-verified can re-claim
  (claim flow burns squatter's slug, refunds rent).
- **B:** Stake-and-slash: 0.1 SOL bonded at registration. Verified
  authors of conflicting claims can vote-slash via lightweight DAO.
- **C:** Solana Attestation Service binding GitHub identity to slug.

For Solana Summit pitch, **A** is enough.

---

## Roadmap to 10/10

### Sprint 1 (days 1–3): Real agent SDK

- [ ] Publish `@cortex/sdk` to npm (`payForCall`, `discoverSkills`,
      `getWalletState`).
- [ ] `@cortex/sdk/langchain` wrapper (one Tool per skill).
- [ ] `@cortex/sdk/ai-sdk` wrapper for Vercel AI SDK.
- [ ] Update `demo-agent` to use Anthropic Sonnet + 3 real skills via
      `CortexTool` with reasoning visible in stdout.

### Sprint 2 (days 4–6): Wallet UI

- [ ] `/agent` redesigned with Phantom-connect → Create/Deposit/Withdraw
      modals.
- [ ] Live balance, daily-spent / daily-limit progress.
- [ ] Tx history table fed by program events.

### Sprint 3 (days 7–10): MCP adapter + real demo

- [ ] `@cortex/mcp` package: serves any Cortex skill as MCP tool over
      stdio. Drop-in for Claude Desktop config.
- [ ] One real paid skill end-to-end: `cortex-research` (Tavily-backed
      search wrapped behind Cortex). Real LLM agent in the demo calls it
      three times, you can see settle txs in Solscan in real time.

### Sprint 4 (days 11–14): Defensibility

- [ ] `cortex publish` CLI + GitHub-OAuth verification.
- [ ] Author dashboard at `/authors/[pubkey]`: revenue, calls/day, top
      skills.
- [ ] Add S1/S2/S4 mitigations to program (close, rotate, lowercase
      slug, withdraw event).
- [ ] Mainnet deploy + Anchor verify.

### Stretch (post-Summit):

- Trust scoring layer (compete head-to-head with Aegis).
- Skill bundles + royalty cascade.
- Phantom-mobile.
- Spend-policy plugins.

---

## Pitch positioning (for Summit + YC RFS)

**One-liner:** _Cortex is the programmable wallet primitive for AI
agents on Solana. USDC for agents, not an App Store._

**Why now:** x402 standardised payments; the marketplace layer is
becoming commodity (Aegis, SkillMarket). The **wallet** layer
(programmable spending policy enforced on-chain) is where security and
composability matter — and is unclaimed.

**Why us:** Solo, ship-velocity, opinionated about open-source-tokenless.
We can't out-marketing SkillMarket's $SKILL airdrop, but we can
out-engineer them on safety & composability — and be the rail every
marketplace runs on.

**Risks:**

- Aegis adds spending caps in their next release → wedge narrows.
- Solana Foundation ships a "wallet primitive" reference impl →
  we get squeezed.
- Mitigation: ship SDK + MCP adapter fast, get adopted in agent
  runtimes (LangChain, Mastra, AI SDK) before competitors do.

---

## Recommended next decision

User: pick one of three paths.

- **Path α (recommended): Sprint 1 + 2 only, ship before Summit.**
  Real SDK + Wallet UI = enough to demo a _real_ agent. ~6 days work.
- **Path β: Sprint 1 + 2 + 3, ship 1 week after Summit deadline.**
  Full agent demo with real LLM + MCP. ~10 days. Misses Summit but
  the form already has working MVP for May 7.
- **Path γ: All four sprints, postpone all submissions.**
  10/10 product but trades speed for completeness.

I recommend **α**: the form deadline is locked, we already have a
working MVP, and the high-leverage moves are SDK + Wallet UI.
Everything else can be a v2 announcement post-Summit.

---

_Audit author: Cortex engineering session (Devin), May 2026._
