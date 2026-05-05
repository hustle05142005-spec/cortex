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

| Account       | Seeds                                | Purpose                                                         |
| ------------- | ------------------------------------ | --------------------------------------------------------------- |
| `AgentWallet` | `[b"agent", agent_pubkey]`           | Per-agent vault, owner, mint, per-call + daily spending limits  |
| `Skill`       | `[b"skill", slug.as_bytes()]`        | Author, mint, price-per-call, manifest URI, lifetime stats      |
| Vault         | ATA owned by `AgentWallet` PDA       | Holds the agent's USDC; PDA-signed CPI moves funds to the author|

Six instructions:

- `create_agent_wallet(per_call_limit, daily_limit)`
- `update_agent_limits(per_call_limit, daily_limit)`
- `withdraw(amount)` — owner-only escape hatch
- `register_skill(slug, name, description, manifest_uri, price_per_call)`
- `update_skill(price?, active?)`
- `pay_for_call()` — signed by the agent runtime; checks limits, settles SPL transfer, emits `CallPaid`

### TypeScript SDK — `sdk/`

Drop-in wrapper around the Anchor TS client. Exposes `CortexClient` with
PDA helpers, account fetchers, and method builders for every instruction.

```ts
import { CortexClient } from "../sdk/src";

const cortex = new CortexClient(provider);
await cortex.payForCall({ ... }).rpc();
const skills = await cortex.listSkills();
```

### Next.js dashboard — `app/`

Three routes:

- `/` — overview, lifetime stats, "how a call settles" explainer
- `/marketplace` — every registered skill, live counters, links to author and manifest
- `/agent` — live snapshot of an AgentWallet PDA: balance, limits, daily progress

All reads are server-rendered against devnet. No wallet required to browse.

### Demo agent — `demo-agent/`

A Node.js script that:

1. Creates an `AgentWallet` PDA if missing.
2. Tops up the vault from the owner's ATA.
3. Calls each registered demo skill once (10 skills covering search,
   summarisation, translation, RAG, on-chain audit, image generation, TTS,
   weather, price feeds, and Colosseum research).
4. Prints solscan links for every settlement and a final summary.

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
