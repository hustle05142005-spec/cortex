# Cortex

[![CI](https://github.com/hustle05142005-spec/cortex/actions/workflows/ci.yml/badge.svg)](https://github.com/hustle05142005-spec/cortex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-14F195.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-devnet-9945FF)](https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet)
[![Hackathon](https://img.shields.io/badge/Colosseum-Frontier_2026-14F195)](https://colosseum.com/frontier)

> **Programmable wallets and a paid skill marketplace for AI agents on Solana.**
> Per-call and daily spending caps are enforced by the program itself, so a
> compromised agent key loses at most a day's budget — not the whole vault.

[Live dashboard](https://cortex-hustle05142005-specs-projects.vercel.app) ·
[Anchor program on Solscan](https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet) ·
[Mainnet checklist](docs/MAINNET.md) ·
[Audit](AUDIT.md)

---

## Submission

Built for the **Colosseum Frontier 2026** hackathon and the **Solana Summit
Kazakhstan – Startup Battle**.

| Builder | Role | Contact |
| --- | --- | --- |
| hustle05142005 | Founder & engineer | `hustle05142005@gmail.com` |

---

## Problem and solution

### 1. Agent keys are blast radius bombs

Every other agent-payment stack today (Skyfire, Lit Protocol, mcpay.tech,
SkillMarket) trusts the agent runtime to honour off-chain spending limits.
If the runtime is compromised — leaked key, prompt injection, jailbreak —
the attacker drains the funding wallet.

**Cortex:** the per-call cap and daily cap are stored on the `AgentWallet`
PDA. The program rejects any `pay_for_call` that would breach them. A
compromised key loses one day's budget.

### 2. Skill authors have no clean revenue rail

Today an author hosts a paid endpoint, runs Stripe + auth + invoicing,
and only sees the money days later. They can't price below ~$0.10 per
call without burning margin on processor fees.

**Cortex:** authors register a slug + price-per-call on-chain. Every paid
call is one SPL transfer to the author's ATA, sub-cent fee. Pricing
starts at 0.02 USDC per call.

### 3. Agents need a discovery layer that pays

LangChain / AI SDK / MCP all give agents tool surfaces, but none of them
carry payment. An agent can't pay a third-party skill atomically with
the call.

**Cortex:** `cortex-sdk/langchain`, `cortex-sdk/ai-sdk`, and `cortex-sdk/mcp`
turn every on-chain skill into a tool that settles in USDC before the
HTTP call hits the skill endpoint.

---

## Why Solana

- **Cost.** A `pay_for_call` settle costs roughly $0.0002. A 0.02 USDC
  skill fee is still 99% margin for the author after network fees. No
  other L1 makes sub-cent agentic payments viable.
- **Speed.** 400 ms confirmation lets an agent settle and call a skill
  without the user noticing extra latency.
- **SPL Token + ATA.** Authors get paid in their existing USDC token
  account. No new tokens to manage. Mainnet uses Circle USDC; devnet
  uses a dev mint with the same decimals.
- **Anchor PDAs.** The vault is owned by a program-derived address, so
  the agent's keypair can sign `pay_for_call` without ever holding
  custody of funds.

---

## What's in the repo

```
programs/cortex_program/   Anchor program (Rust)
sdk/                       cortex-sdk: high-level Cortex class + Anchor client
sdk/src/langchain.ts       LangChain Tools adapter
sdk/src/ai-sdk.ts          Vercel AI SDK adapter
sdk/src/mcp.ts             Model Context Protocol server adapter
sdk/src/gateway.ts         Express / Next.js middleware for skill authors
cli/                       cortex publish CLI (cortex.toml + idempotent on-chain register)
app/                       Next.js dashboard (App Router) + /authors/[pubkey]
demo-agent/                Demo agent: smoke mode + LangChain mode
scripts/seed-devnet.ts     Idempotent: creates devUSDC + registers seed skills
docs/MAINNET.md            Mainnet deploy + verification + monitoring checklist
tests/cortex.test.ts       Anchor integration tests
```

---

## Anchor program

Program ID: [`DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV`](https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet)
(live on **devnet**, IDL published on-chain).

### Account types

| Account | Seeds | Purpose |
| --- | --- | --- |
| `AgentWallet` | `[b"agent", agent_pubkey]` | Per-agent vault, owner, mint, per-call + daily caps |
| `Skill` | `[b"skill", slug.as_bytes()]` | Author, mint, price-per-call, manifest URI, lifetime stats |
| Vault | ATA owned by `AgentWallet` PDA | Holds the agent's USDC; PDA-signed CPI moves funds to the author |

### Instructions

| Instruction | Signer | Effect |
| --- | --- | --- |
| `create_agent_wallet` | owner | Creates the PDA + ATA, sets caps |
| `update_agent_limits` | owner | Tighten or loosen `per_call_limit` / `daily_limit` |
| `withdraw` | owner | Pulls USDC out of the vault. Emits `Withdrawn` |
| `close_agent_wallet` | owner | Drains the vault, closes ATA + PDA, refunds rent. Emits `AgentWalletClosed` |
| `register_skill` | author | Registers a slug. Validates `lowercase ASCII / digits / -` / `_` |
| `update_skill` | author | Adjusts `price`, `active` |
| `close_skill` | author | Closes the skill PDA. Emits `SkillClosed` |
| `pay_for_call` | agent | Asserts caps, performs SPL CPI to author's ATA. Emits `CallPaid` |

A successful `pay_for_call` is **one** transaction:

1. Anchor verifies the agent signer matches `AgentWallet.agent`.
2. Asserts the skill is active, the mint matches, `price ≤ per_call_limit`.
3. Resets `daily_spent` if 24 h elapsed since the last reset.
4. Asserts `daily_spent + price ≤ daily_limit`.
5. PDA-signed CPI to the SPL Token program: vault → author ATA.
6. Updates counters on both `AgentWallet` and `Skill`. Emits `CallPaid`.

If anything fails the whole tx reverts. The agent runtime can lose at most
a day's budget to a buggy or compromised loop.

---

## Architecture

```
┌──────────┐  pay_for_call         ┌──────────────────┐  CPI: spl_transfer
│  Agent   │ ───────────────────▶  │  cortex_program  │ ─────────────────▶ ┌────────────┐
│ (signer) │                       │  (Anchor)        │                    │ Author ATA │
└──────────┘                       └────────┬─────────┘                    └────────────┘
                                            │
                                            ▼
                                ┌────────────────────────┐
                                │ AgentWallet PDA stats  │
                                │ Skill PDA stats        │
                                │ Emit: CallPaid event   │
                                └────────────────────────┘
```

---

## TypeScript SDK

Published as the workspace package `cortex-sdk`. Full API in
[`sdk/README.md`](./sdk/README.md).

```ts
import { Cortex } from "cortex-sdk";

const cortex = new Cortex({ rpcUrl, agent, owner });
await cortex.depositUsdc(5_000_000);                   // 5 USDC top-up
const skills = await cortex.discoverSkills();          // 12 registered skills
const result = await cortex.payForCall("demo-summarize", { input: "…" });
console.log(result.signature, result.pricePaid.toString());
```

Three subpath integrations ship with the package:

```ts
import { cortexLangChainTools }     from "cortex-sdk/langchain"; // LangChain
import { cortexAiTools }            from "cortex-sdk/ai-sdk";    // Vercel AI SDK
import { buildCortexMcpServer }     from "cortex-sdk/mcp";       // MCP server
import { cortexPaymentMiddleware }  from "cortex-sdk/gateway";   // skill-side
```

`cortex-sdk/langchain` and `cortex-sdk/ai-sdk` turn every registered skill
into a tool the LLM can call. `cortex-sdk/mcp` exposes the same skills as
a Model Context Protocol server, drop-in for Claude Desktop / Cursor /
Cline. `cortex-sdk/gateway` plugs into Express or Next.js Route Handlers
to verify `x-cortex-payment` proofs before serving content.

Lower-level access stays available via `import { CortexClient } from "cortex-sdk"`
for hand-built txs, account fetchers, and PDA helpers.

---

## `cortex publish` CLI

Author-side tool. Drop a `cortex.toml` next to your skill's HTTP handler
and run `cortex publish` to register it on-chain.

```bash
npx ts-node cli/bin/cortex.ts publish path/to/cortex.toml
npx ts-node cli/bin/cortex.ts inspect <slug>          # read-only state
npx ts-node cli/bin/cortex.ts deactivate <slug>       # active = false
npx ts-node cli/bin/cortex.ts close <slug>            # close PDA, refund rent
```

The CLI is **idempotent**: re-publishing an existing slug only writes the
fields that drifted (price, manifest URI, active flag). When `verify_url`
is set in `cortex.toml`, the CLI fetches that URL (e.g. a raw GitHub URL
pointing at the canonical TOML) and warns about local/remote diffs before
publishing — a lightweight provenance signal without a full GitHub OAuth
flow. Reference TOML lives at
[`app/api/skills/cortex-search/cortex.toml`](./app/api/skills/cortex-search/cortex.toml).

---

## Dashboard

Four routes, all reading on-chain state from devnet RPC.

- `/` — overview, lifetime stats, "how a call settles" explainer
- `/marketplace` — every registered skill, live counters, links to author and manifest
- `/authors/[pubkey]` — author dashboard: total revenue, total calls, top-5 skills by revenue
- `/agent` — interactive wallet UI:
  - Connect Phantom or Solflare; the connected wallet becomes the **owner key**
  - Auto-generates a fresh **agent signer keypair** in the browser, capped by
    on-chain limits even if leaked
  - Create wallet / Deposit / Withdraw / Update limits modals each fire a real on-chain tx
  - Live vault balance, daily-spent progress bar, last 10 transactions on the PDA
  - "Get 5 devUSDC" faucet button on devnet (server-side mint authority,
    optional — see `CORTEX_FAUCET_AUTHORITY` env var below)
  - Without a connected wallet: read-only snapshot of `NEXT_PUBLIC_DEMO_AGENT_PUBKEY`
    so the page is still useful for visitors

---

## Demo agent

A workspace package (`cortex-demo-agent`) with two modes:

1. **Smoke mode** (default). Bootstraps a wallet, tops up the vault, then
   iterates through every registered skill and pays for each call once.
   Halts cleanly if the on-chain spending policy fires (per-call,
   daily-limit, insufficient balance). Proves the wedge in one run.
2. **LLM mode** (`ANTHROPIC_API_KEY=…`). Wires the same `Cortex` SDK
   into a LangChain agent backed by Claude Sonnet. Each tool call the
   LLM picks results in an on-chain settle.

Both modes print Solscan links for every settlement and a final lifetime
and daily-spend summary.

---

## Quickstart

### Prerequisites

```bash
# Toolchain (Solana CLI 3.x, Anchor 0.31, Rust 1.95+)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1 && avm use 0.31.1
```

### Build and test the program

```bash
npm install
npm run anchor:build        # compiles + syncs IDL into sdk/idl/
npm run anchor:test         # 7 integration tests against a fresh validator
```

### Deploy to devnet

```bash
solana airdrop 2            # fund your local keypair
npm run anchor:deploy:devnet
```

### Seed demo state and run the agent

```bash
npm run demo:seed           # creates a devUSDC mint and registers seed skills
npm run demo:agent          # creates wallet, tops up vault, calls every skill
```

### Run the dashboard

```bash
cp .env.example .env.local  # devnet defaults are committed
npm run dev                 # http://localhost:3000
```

### Deploy the dashboard to Vercel (1-click)

1. Go to [vercel.com/new](https://vercel.com/new), import this GitHub repo.
2. Vercel auto-detects Next.js. Leave the default build command.
3. In **Environment Variables**, paste the four `NEXT_PUBLIC_*` keys from
   [`.env.example`](./.env.example) (devnet defaults).
4. Click **Deploy**. The dashboard reads on-chain state from devnet on
   every request. No backend required.

---

## Roadmap

- [x] Anchor program v1: `AgentWallet`, `Skill`, `pay_for_call`
- [x] On-chain spending policy (per-call + daily caps)
- [x] TypeScript SDK with LangChain, Vercel AI SDK, MCP, gateway adapters
- [x] Phantom / Solflare wallet UI on `/agent`
- [x] First live skill backed by Tavily (`cortex-search-live`)
- [x] Anchor program v2: `close_agent_wallet`, `close_skill`, slug normalisation, `Withdrawn` event
- [x] `cortex publish` CLI with `cortex.toml` + idempotent updates
- [x] Author dashboard `/authors/[pubkey]`
- [x] Mainnet deploy checklist (`docs/MAINNET.md`)
- [ ] Mainnet deploy (Squads multisig 2-of-3 upgrade authority)
- [ ] `solana-verify` verified badge
- [ ] On-chain skill quality signal (stake-and-slash)

---

## Resources

- [Live dashboard](https://cortex-hustle05142005-specs-projects.vercel.app)
- [Program on Solscan (devnet)](https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet)
- [SDK README](./sdk/README.md)
- [AUDIT](./AUDIT.md) — competitive landscape, threat model, defensible wedge
- [MAINNET deploy checklist](./docs/MAINNET.md)

---

## License

MIT. See [LICENSE](LICENSE).
