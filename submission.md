# Solana Summit Kazakhstan — Startup Battle submission (Cortex)

> Заготовка для копи-пейста в форму
> https://docs.google.com/forms/d/e/1FAIpQLSdJGiAlR7yHF73pMvyxl3lIZmbQEpLsImJaXIi0Mj4BtWJyew/viewform
>
> Питч можно сдавать на русском. Ниже даю **EN-версию** (для YC RFS / международного жюри) и **RU-версию** (для формы Summit). Бери что лучше ложится на конкретный вопрос — обе короткие.

---

## Founder / contact (factual)

| Field                          | Value                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Founder name                   | Chsherbakov Oleg                                                                                                                           |
| Email                          | chsherbakovoleg@gmail.com                                                                                                                  |
| Telegram                       | @jcdrip                                                                                                                                    |
| Country / city                 | Kazakhstan, Aktobe                                                                                                                         |
| Team size                      | 1 (solo founder)                                                                                                                           |
| Stage                          | MVP                                                                                                                                        |
| GitHub                         | https://github.com/hustle05142005-spec/cortex                                                                                              |
| Program ID (live on devnet)    | [`DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV`](https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet)   |
| AgentWallet PDA (live, devnet) | [`3rxzBiqs8c3xb9pZBpcLMurR1RvEoiJxa6c11VdmpzEUn`](https://solscan.io/account/3rxzBiqs8c3xb9pZBpcLMurR1RvEoiJxa6c11VdmpzEUn?cluster=devnet) |
| devUSDC mint (live, devnet)    | [`9QtDZ1ojHg8UtUtcxjzZ2Xb24Z8vRJ3vEiVgBSAskpn5`](https://solscan.io/token/9QtDZ1ojHg8UtUtcxjzZ2Xb24Z8vRJ3vEiVgBSAskpn5?cluster=devnet)     |

## Sector / category (form selector)

- **Primary**: AI x Crypto
- **Secondary**: Infrastructure
- (If single-select: **AI x Crypto**)

---

## Project name

**Cortex**

## One-liner — EN

Solana-native infrastructure for AI agents: programmable PDA wallets with
hard spending limits + a permissionless skill marketplace where every call
settles in one SPL transfer.

## One-liner — RU

Solana-инфраструктура для AI-агентов: программируемый PDA-кошелёк с
жёсткими лимитами + открытый маркетплейс скиллов, где каждый вызов
оплачивается одной транзакцией в USDC.

---

## Problem — EN

AI agents are starting to take real economic actions, but the rails
underneath them are broken:

1. **No safe wallets.** Today an agent either holds a hot key with no
   limits (rug-risk), or it pings a centralized backend with API keys
   (no autonomy, no audit trail).
2. **No native pay-per-call.** Stripe/SaaS billing assumes humans, not
   agents — monthly invoices, KYC, $0.30 minimums make sub-cent calls
   impossible.
3. **No open skill economy.** Tools live behind closed APIs; an
   agent can't discover a new capability and start paying for it
   without a contract.

## Problem — RU

AI-агенты начинают совершать реальные экономические действия, но рельсы
под ними сломаны:

1. **Нет безопасных кошельков.** Сегодня у агента либо горячий ключ без
   лимитов (rug-риск), либо централизованный бэкенд с API-ключами (нет
   автономии, нет on-chain пруфов).
2. **Нет нативной оплаты за вызов.** Stripe и SaaS-биллинг рассчитаны на
   людей: месячные инвойсы, KYC, минималки $0.30 — суб-центовые
   платежи невозможны.
3. **Нет открытого маркетплейса скиллов.** Инструменты живут за
   закрытыми API; агент не может «найти и начать платить» новой
   способности без юр-контракта.

## Solution — EN

Cortex is a single Anchor program with two primitives:

- `AgentWallet` PDA — owner deposits USDC, sets a per-call cap and a
  24h daily cap, and hands the agent a separate signing key. The PDA
  is the source of truth: the agent can spend up to its limits and not
  one lamport more.
- `Skill` PDA — any author registers a slug, a USDC price-per-call,
  and a manifest URL pointing at their endpoint.

One instruction — `pay_for_call` — atomically (a) checks limits,
(b) does an SPL CPI from the agent vault to the author's ATA, (c) bumps
counters, (d) emits an event. One Solana transaction = one paid call.

## Solution — RU

Cortex — одна Anchor-программа с двумя примитивами:

- `AgentWallet` PDA — владелец кладёт USDC, ставит per-call cap и
  суточный cap, выдаёт агенту отдельный signing-ключ. PDA — источник
  правды: агент тратит до своих лимитов и ни лампорта больше.
- `Skill` PDA — любой автор регистрирует slug, цену в USDC за вызов и
  URL манифеста (свой endpoint).

Одна инструкция `pay_for_call` атомарно (а) проверяет лимиты, (б) делает
SPL-CPI из кошелька агента на ATA автора, (в) обновляет счётчики,
(г) эмитит ивент. Одна транзакция = один оплаченный вызов.

---

## Why Solana — EN

- **Speed + fees**: ~400ms confirmation and sub-cent fees are mandatory
  for per-call billing — no other L1 can do `0.05 USDC` payments
  economically.
- **PDA model**: spending limits enforced by the program, not by
  off-chain logic. The agent literally can't break them.
- **SPL token + Token-2022**: USDC is already the de-facto unit of
  account in the Solana app layer.
- **x402 / micropayments standard** is being built on Solana
  specifically — Cortex slots in as the agent-side primitive.

## Why Solana — RU

- **Скорость + комиссии**: ~400 мс финал и суб-центовые комиссии —
  обязательное условие для billing'а за вызов. Ни один другой L1 не
  тащит платежи по 0.05 USDC экономически.
- **PDA**: лимиты расходов гарантирует сама программа, не оффчейн-логика.
- **SPL/USDC** — уже фактическая единица расчёта в экосистеме.
- **x402** строится именно на Solana — Cortex встаёт как
  агент-сторона этой стандартной плитки.

---

## Why now — EN

Q1–Q2 2026 is the first quarter where multiple frontier models ship as
agentic loops by default. YC's RFS lists "AI-Native Service Companies"
and "Company Brain" — both impossible without a settlement layer.
Stripe and Coinbase shipped agent-payment products in 2025, but they
are custodial and human-rate-limited. The opportunity is the open,
permissionless version that runs on existing Solana rails.

## Why now — RU

Q1–Q2 2026 — первый квартал, когда фронтирные модели по умолчанию
работают в режиме агентов. YC RFS просит «AI-Native Service Companies»
и «Company Brain» — обе категории невозможны без расчётного слоя.
Stripe и Coinbase в 2025 запустили agent-payment продукты, но они
кастодиальные и rate-limited под людей. Open + permissionless версия
живёт на уже работающих рельсах Solana — это и есть точка входа.

---

## Traction / what's built (live on devnet, May 2026)

- **Anchor program v2** live at `DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV`. Eight instructions, integration tests passing, IDL pinned on-chain at `DiQLhn84rRhxz38MNNu4DKJRrZD12kFYCp69KnLUVaR`.
- **`cortex-sdk` workspace package** with four subpath integrations: `cortex-sdk/langchain`, `cortex-sdk/ai-sdk`, `cortex-sdk/mcp`, `cortex-sdk/gateway`. Every Cortex skill is reachable from LangChain, Vercel AI SDK, and Claude Desktop / Cursor / Cline via MCP.
- **`cortex publish` CLI** in `cli/bin/cortex.ts`. Reads `cortex.toml`, registers the slug on-chain, idempotent on re-publish, optional `verify_url` provenance check.
- **Next.js dashboard** with four routes (`/`, `/marketplace`, `/agent`, `/authors/[pubkey]`) deployed to Vercel, reading on-chain state from devnet RPC on every request.
- **Phantom + Solflare wallet UI** at `/agent`. Connect, create wallet, deposit, withdraw, update limits, devUSDC faucet, live tx history with Solscan links.
- **12 skills registered on devnet** covering price feeds, weather, summarisation, web search, translation, RAG, on-chain audit, Colosseum research, image generation, TTS, plus the live Tavily-backed `cortex-search-live`. Prices range 0.02 – 0.25 devUSDC.
- **First end-to-end live skill** at `/api/skills/cortex-search`, gated by `cortex-sdk/gateway` middleware — the agent settles on-chain, then the gateway verifies the `x-cortex-payment` header before serving the Tavily response.
- **Demo agent** runs in two modes: smoke (deterministic loop through every skill, halts on `DailyLimitExceeded`) and LangChain (Anthropic Claude Sonnet picks tools and settles).
- **Mainnet deployment checklist** at `docs/MAINNET.md` (verifiable build, Squads 2-of-3 upgrade authority, `solana-verify`, on-chain IDL, monitoring).
- GitHub: https://github.com/hustle05142005-spec/cortex (open source, MIT, eight PRs merged across four sprints).

## Demo / artifacts to attach

- **Live dashboard** (Vercel): https://cortex-hustle05142005-specs-projects.vercel.app
- **GitHub**: https://github.com/hustle05142005-spec/cortex
- **Solscan — program (devnet)**: https://solscan.io/account/DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV?cluster=devnet
- **Solscan — AgentWallet PDA (devnet)**: https://solscan.io/account/3rxzBiqs8c3xb9pZBpcLMurR1RvEoiJxa6c11VdmpzEUn?cluster=devnet
- **Solscan — devUSDC mint (devnet)**: https://solscan.io/token/9QtDZ1ojHg8UtUtcxjzZ2Xb24Z8vRJ3vEiVgBSAskpn5?cluster=devnet
- **AUDIT.md** (competitive landscape + threat model + post-implementation status): in repo root
- **MAINNET.md** (deploy + verification checklist): `docs/MAINNET.md`

---

## Competitors / why Cortex is different

| | Approach | Cortex differs by |
| --- | --- | --- |
| Stripe Agents (2025) | Custodial, fiat, monthly invoices | Permissionless, on-chain, sub-cent per-call |
| Coinbase Agent Wallets | EVM, custodial flow | PDA-enforced limits, SPL-native |
| Aegis Place | Off-chain spending caps, 10% protocol fee, NeMo trust score | Caps enforced by the program itself, no protocol fee |
| SkillMarket / $SKILL | Bonding-curve token, 30% take (10 protocol + 20 stakers) | Tokenless, 0% take, USDC-only |
| mcpay.tech | Off-chain custodian wallet | On-chain PDA wallet, owner keeps custody |
| LangChain Tools / OpenAI Functions | No payment layer | Built-in monetisation for skill authors |
| `solana.new` agent-wallet template | Wallet only | Wallet, skill marketplace, SDK, MCP, gateway, CLI |

---

## Moat / defensibility

1. **Standard, not a product.** If Cortex's `pay_for_call` becomes the
   default verb for agent skills on Solana, the network effect is the
   skill registry itself.
2. **Tight on-chain primitives.** Spending caps + slug + price are
   small, audit-friendly, and hard to fork meaningfully.
3. **Distribution via solana.new + Colosseum.** Both surfaces can
   ship Cortex as the canonical agent-payments scaffold.

---

## Use of funds (if asked)

Solo founder + 90 days runway:

- 60% — security audit of the Anchor program (one full external pass).
- 25% — devrel: 5 lighthouse skill integrations (one of them
  Colosseum Copilot's research API), reference UI, docs.
- 15% — Helius/Triton infra + mainnet deploy + monitoring.

---

## Ask

- Place in the Startup Battle finals to pitch Cortex live in Almaty
  on May 22.
- Intro to a Solana ecosystem fund (Multicoin, Anagram, Solana
  Foundation, Foundry) for a $500k pre-seed.
- 1-2 lighthouse design partners in Almaty / wider Central Asia
  building agent products who will test the SDK in the next 30 days.

---

## Notes for filling the form

1. **Sector field**: pick `AI x Crypto`. If it's multi-select, also add
   `Infrastructure`.
2. **Stage**: `MVP`.
3. **Team**: 1 (solo) — Chsherbakov Oleg, full-stack + protocol.
4. **Demo link**: paste the GitHub repo URL plus the walkthrough
   video. If the form only takes one URL — use the GitHub repo (it
   links to the video in README).
5. **Pitch deck**: if marked optional, skip; if required, write
   "available on request" and email me — I'll build a 5-slider in 2
   hours.
6. **Free-form description**: paste the EN one-liner + the EN
   problem/solution sections. They fit ~250 words.
