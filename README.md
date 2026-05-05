# Cortex

**Programmable wallet + on-chain skill marketplace for AI agents, settled on Solana.**

Cortex is a Solana-native infrastructure layer for AI agents. Every agent gets
a PDA-owned vault with hard per-call and daily spending limits. Authors
register paid skills (slug + price-per-call + manifest URL); agents discover
those skills, settle each call on-chain in a single SPL transfer, and revenue
accrues directly to the author's ATA.

> Built for **Solana Summit Kazakhstan – Startup Battle 2026** and the
> **YC RFS Summer 2026** themes _AI-Native Service Companies_ and
> _Company Brain_.

---

## What's in the box

```
programs/cortex_program/        # Anchor program (Rust)
sdk/                            # TypeScript SDK (CortexClient + IDL re-export)
app/                            # Next.js dashboard (App Router)
demo-agent/                     # Node.js demo agent — calls every paid skill once
scripts/seed-devnet.ts          # Idempotent: creates devUSDC + registers 10 skills
tests/cortex.test.ts            # 7 Anchor integration tests
```

### Anchor program — `cortex_program`

Program ID: [`DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV`](https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet) (live on **devnet**)

Three account types:

| Account       | Seeds                          | Purpose                                                          |
| ------------- | ------------------------------ | ---------------------------------------------------------------- |
| `AgentWallet` | `[b"agent", agent_pubkey]`     | Per-agent vault, owner, mint, per-call + daily spending limits   |
| `Skill`       | `[b"skill", slug.as_bytes()]`  | Author, mint, price-per-call, manifest URI, lifetime stats       |
| Vault         | ATA owned by `AgentWallet` PDA | Holds the agent's USDC; PDA-signed CPI moves funds to the author |

Six instructions:

- `create_agent_wallet(per_call_limit, daily_limit)`
- `update_agent_limits(per_call_limit, daily_limit)`
- `withdraw(amount)` — owner-only escape hatch
- `register_skill(slug, name, description, manifest_uri, price_per_call)`
- `update_skill(price?, active?)`
- `pay_for_call()` — signed by the agent runtime; checks limits, settles SPL transfer, emits `CallPaid`

### TypeScript SDK — `cortex-sdk`

Published as the workspace package `cortex-sdk` (see [`sdk/README.md`](./sdk/README.md)
for the full API). High-level facade hides the Anchor plumbing:

```ts
import { Cortex } from "cortex-sdk";

const cortex = new Cortex({ rpcUrl, agent, owner });
await cortex.depositUsdc(5_000_000);                       // 5 USDC top-up
const skills = await cortex.discoverSkills();              // 10 registered skills
const result = await cortex.payForCall("demo-summarize", { input: "…" });
console.log(result.signature, result.pricePaid.toString());
```

Three subpath integrations ship out of the box:

```ts
import { cortexLangChainTools } from "cortex-sdk/langchain"; // LangChain Tools
import { cortexAiTools }        from "cortex-sdk/ai-sdk";    // Vercel AI SDK Tools
import { cortexPaymentMiddleware } from "cortex-sdk/gateway"; // skill-side gating
```

`cortex-sdk/langchain` and `cortex-sdk/ai-sdk` turn every registered skill
into a tool the LLM can call. `cortex-sdk/gateway` plugs into Express /
Next.js Route Handlers to verify `x-cortex-payment` proofs before
serving content.

Lower-level access is still available — `import { CortexClient } from "cortex-sdk"`
for hand-built txs, account fetchers, and PDA helpers.

### Next.js dashboard — `app/`

Three routes:

- `/` — overview, lifetime stats, "how a call settles" explainer
- `/marketplace` — every registered skill, live counters, links to author and manifest
- `/agent` — live snapshot of an AgentWallet PDA: balance, limits, daily progress

All reads are server-rendered against devnet. No wallet required to browse.

### Demo agent — `demo-agent/`

A workspace package (`cortex-demo-agent`) with two modes:

1. **Smoke mode** (default): Bootstraps a wallet, tops up the vault, then
   iterates through every registered skill and pays for each call once.
   Halts cleanly if the on-chain spending policy fires (per-call /
   daily-limit / insufficient-balance) — proves the wedge in one run.
2. **LLM mode** (`ANTHROPIC_API_KEY=…`): Wires the same `Cortex` SDK
   into a real LangChain agent backed by Claude Sonnet. Each tool call
   the LLM picks results in an on-chain settle; intermediate steps are
   printed with their settle signatures.

Both modes print Solscan links for every settlement and a final
lifetime / daily-spend summary.

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
npm run anchor:build         # compiles + syncs IDL into sdk/idl/
npm run anchor:test          # runs the 7 integration tests against a fresh validator
```

### Deploy to devnet

```bash
solana airdrop 2             # fund your local keypair
npm run anchor:deploy:devnet
```

### Seed demo state and run the agent

```bash
npm run demo:seed            # creates a devUSDC mint and registers 3 skills
npm run demo:agent           # creates wallet, tops up vault, calls every skill
```

### Run the dashboard

```bash
cp .env.example .env.local            # devnet defaults are committed
npm run dev                            # http://localhost:3000
```

### Deploy the dashboard to Vercel (1-click)

1. Go to [vercel.com/new](https://vercel.com/new), import this GitHub repo.
2. Vercel auto-detects Next.js — leave the default build command.
3. In **Environment Variables**, paste the four `NEXT_PUBLIC_*` keys from
   [`.env.example`](./.env.example) (devnet defaults).
4. Click **Deploy**. The dashboard reads on-chain state from devnet on
   every request — no backend required.

---

## Architecture

```
┌──────────┐  pay_for_call         ┌──────────────────┐  CPI: spl_transfer
│  Agent   │ ───────────────────▶  │  cortex_program  │ ─────────────────────▶
│ (signer) │                       │  (Solana)        │                        │
└──────────┘                       └────────┬─────────┘                        ▼
                                            │  reads: AgentWallet, Skill   ┌────────────┐
                                            │  writes: counters             │ Author ATA │
                                            └──────────────────────────────▶└────────────┘
```

A successful call is **one** Solana transaction:

1. Anchor verifies the agent signer matches `AgentWallet.agent`.
2. Asserts skill is active, mint matches, `price ≤ per_call_limit`.
3. Resets `daily_spent` if 24h elapsed; asserts `daily_spent + price ≤ daily_limit`.
4. PDA-signed CPI to the SPL Token program: vault → author ATA.
5. Updates counters on both `AgentWallet` and `Skill`. Emits `CallPaid`.

If anything fails (limit exceeded, paused skill, mismatched mint), the entire
transaction reverts. The agent runtime can lose **at most a day's budget** to a
buggy or compromised loop.

---

## Why "agent + marketplace" together

A programmable wallet without callable counterparts is just a vault. A skill
marketplace without enforceable spend caps just hands every author a blank
check on the agent's balance. Putting them in the same program lets us:

- Settle each x402-style micropayment in **one** transaction (~1¢ Solana fee).
- Enforce policy on-chain — no off-chain trust between the agent runtime and
  the skill provider.
- Give skill authors a single API for revenue: "your ATA accrues every time".

---

## License

MIT
