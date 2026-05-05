# cortex-sdk

> Solana-native programmable wallets + skill marketplace SDK for AI agents.

`cortex-sdk` is the agent-side library for [Cortex](https://github.com/hustle05142005-spec/cortex).
It exposes a small TypeScript surface for:

- creating and topping-up an `AgentWallet` (a PDA-owned vault with
  on-chain spending limits),
- discovering skills registered on-chain,
- paying for skill calls atomically (settle in USDC + optional HTTP
  call to the skill's endpoint with proof-of-payment header),
- registering and updating your own skills if you're an author.

The SDK targets **Solana mainnet/devnet** and **USDC-style SPL mints**.
Per-call and per-day limits are enforced on-chain by the Cortex
program — if your agent goes rogue, the chain stops it, not your
trust assumptions.

## Install

```bash
npm install cortex-sdk @coral-xyz/anchor @solana/web3.js @solana/spl-token bn.js
# Optional integrations:
npm install @langchain/core @langchain/anthropic langchain zod   # LangChain
npm install ai zod                                                # Vercel AI SDK
```

The Solana / Anchor packages are declared as **peer dependencies** so
you control the exact versions in your app.

## Quick start — pay for a skill call

```ts
import { Keypair } from "@solana/web3.js";
import { Cortex } from "cortex-sdk";

const agent = Keypair.fromSecretKey(/* your agent key */);
const cortex = new Cortex({
  rpcUrl: "https://api.devnet.solana.com",
  agent,
});

const skills = await cortex.discoverSkills({ slugs: ["demo-summarize"] });
console.log(skills);
// [
//   {
//     slug: "demo-summarize",
//     name: "Summarize",
//     pricePerCall: BN(80000),  // 0.08 devUSDC
//     manifestUri: "https://example.com/skills/summarize.json",
//     ...
//   },
// ]

const result = await cortex.payForCall("demo-summarize", {
  input: "long text to summarise…",
});
console.log(result.signature); // on-chain settle tx
console.log(result.pricePaid); // 80_000 (micro-USDC)
console.log(result.response); // skill HTTP endpoint response (if reachable)
```

## Wallet management (owner-side)

Owner key is required to create the wallet, deposit USDC, withdraw
back, and tighten/loosen limits.

```ts
const cortex = new Cortex({
  rpcUrl: "https://api.devnet.solana.com",
  agent,
  owner: ownerKeypair,
});

await cortex.createWallet({
  mint: new PublicKey("9Qt…kpn5"),
  perCallLimit: 300_000, // 0.30 USDC
  dailyLimit: 2_000_000, // 2.00 USDC
});

await cortex.depositUsdc(5_000_000); // 5 USDC

const wallet = await cortex.getWalletState();
console.log(wallet.totalCalls.toString(), wallet.dailySpent.toString());

await cortex.withdraw(1_000_000); // 1 USDC back to owner ATA
await cortex.updateLimits({ perCallLimit: 500_000, dailyLimit: 5_000_000 });
```

## LangChain integration

Each Cortex skill becomes a `DynamicStructuredTool`. Drop into any
LangChain agent runtime.

```ts
import { Cortex } from "cortex-sdk";
import { cortexLangChainTools } from "cortex-sdk/langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const cortex = new Cortex({ rpcUrl, agent });
const tools = await cortexLangChainTools(cortex, {
  slugs: ["demo-summarize", "demo-web-search"],
});

const llm = new ChatAnthropic({ model: "claude-sonnet-4-5-20250929" });
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You're an agent with access to paid Cortex skills."],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

const agentRuntime = createToolCallingAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent: agentRuntime, tools });

const res = await executor.invoke({
  input: "Summarise the latest agentic-payments news in 3 bullets.",
});
```

Every tool invocation produces an on-chain settle. Returned tool
output includes `signature`, `pricePaid`, and (if the skill endpoint
is reachable) `response`.

## Vercel AI SDK integration

```ts
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Cortex } from "cortex-sdk";
import { cortexAiTools } from "cortex-sdk/ai-sdk";

const cortex = new Cortex({ rpcUrl, agent });
const tools = await cortexAiTools(cortex);

const { text } = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  prompt: "Summarise the latest Solana stablecoin news in 3 bullets.",
  tools,
  maxSteps: 5,
});
```

## Skill author — register a skill

```ts
const cortex = new Cortex({ rpcUrl, agent, author: authorKeypair });

await cortex.registerSkill({
  slug: "weather",
  name: "Weather",
  description: "Returns current weather for a city.",
  manifestUri: "https://my-skill.example.com/api/call",
  pricePerCall: 50_000, // 0.05 USDC
  mint: new PublicKey("9Qt…kpn5"),
});

await cortex.updateSkill("weather", { newPrice: 100_000 });

const summary = await cortex.getAuthorRevenue(authorKeypair.publicKey);
console.log(
  `${summary.skillCount} skills · ${summary.totalCalls} calls · ${summary.totalRevenue} micro-USDC`
);
```

## Skill author — gate the endpoint

If your skill exposes an HTTP endpoint, gate it with the
`cortexPaymentMiddleware` to verify the agent actually paid:

```ts
import { cortexPaymentMiddleware } from "cortex-sdk/gateway";
import express from "express";

const app = express();
app.use(express.json());

const verifyWeather = cortexPaymentMiddleware({
  rpcUrl: "https://api.devnet.solana.com",
  expectedAuthor: authorKeypair.publicKey,
  expectedSlug: "weather",
});

app.post("/api/call", verifyWeather, async (req, res) => {
  // The middleware attaches req.cortexPayment = { signature, slug, agent, blockTime }
  const proof = (req as any).cortexPayment;
  // ... your skill logic, e.g. fetch openweathermap and return JSON
  res.json({ city: "Aktobe", temp_c: 14 });
});
```

The middleware:

- reads `x-cortex-payment` (settle signature) and `x-cortex-agent` headers,
- fetches the tx from RPC,
- confirms it invoked the Cortex program,
- confirms the logs reference `expectedSlug`,
- confirms the author key is in the static keys,
- rejects settles older than `maxAgeSeconds` (default 5 min),
- responds `402 Payment Required` on any failure.

## Architecture (one paragraph)

The Cortex program (Anchor, Solana mainnet/devnet) defines two PDA
account types: `AgentWallet` (per-agent vault with `per_call_limit` /
`daily_limit` / counters) and `Skill` (per-slug registry entry with
`price_per_call` / `manifest_uri` / `total_revenue`). The agent
holds its own keypair, separate from the human owner's wallet. The
human creates the wallet PDA, deposits USDC into the vault ATA, and
sets spending policy. The agent then signs `pay_for_call` txs at its
own pace; each call atomically transfers `price_per_call` USDC from
the vault to the skill author's ATA, increments daily/lifetime
counters, and emits a `SkillCalled` event the skill's gateway can
verify.

## License

MIT. See [LICENSE](https://github.com/hustle05142005-spec/cortex).
