/**
 * Cortex demo agent — end-to-end run using the high-level cortex-sdk.
 *
 * Two modes:
 *
 *   1. Without ANTHROPIC_API_KEY (default for hackathon judges):
 *      bootstraps wallet, tops up the vault, then iterates through
 *      every registered skill and calls each once. Cheap deterministic
 *      smoke test, lifetime counter +N where N = number of skills.
 *
 *   2. With ANTHROPIC_API_KEY exported:
 *      spins up a real LangChain agent backed by Claude Sonnet, hands
 *      it the registered skills as tools, and lets it solve a small
 *      research task end-to-end. Every tool call settles on-chain
 *      USDC. Tool-call traces include settle signatures.
 *
 * Either mode shares the same `Cortex` SDK setup, the same wallet PDA
 * and the same on-chain accounting.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Cortex } from "cortex-sdk";
import {
  loadConfig,
  loadOrCreateKeypair,
  ensureFunded,
} from "../../scripts/lib/keys";

const PER_CALL = new BN(300_000); // 0.30 devUSDC — covers the priciest skill
const DAILY = new BN(2_000_000); // 2.00 devUSDC daily cap
const TOP_UP_LAMPORTS = 1_500_000; // 1.50 devUSDC vault top-up target

function solscanUrl(sig: string, cluster: string): string {
  if (cluster === "mainnet-beta") return `https://solscan.io/tx/${sig}`;
  return `https://solscan.io/tx/${sig}?cluster=${cluster}`;
}

function microUsdc(n: BN | number | bigint): string {
  const v = n instanceof BN ? n.toNumber() : Number(n);
  return `${(v / 1e6).toFixed(3)} devUSDC`;
}

async function bootstrap(): Promise<{
  cortex: Cortex;
  agent: Keypair;
  owner: Keypair;
  cluster: string;
  mint: PublicKey;
}> {
  const cfg = loadConfig();
  const owner = loadOrCreateKeypair("demo-owner.json");
  const agent = loadOrCreateKeypair("demo-agent.json");
  const mint = new PublicKey(cfg.mint);

  console.log(`[agent] cluster      : ${cfg.cluster}`);
  console.log(`[agent] owner        : ${owner.publicKey.toBase58()}`);
  console.log(`[agent] agent signer : ${agent.publicKey.toBase58()}`);

  const conn = new Connection(cfg.rpcUrl, "confirmed");
  await ensureFunded(conn, owner.publicKey, LAMPORTS_PER_SOL / 10);
  await ensureFunded(conn, agent.publicKey, LAMPORTS_PER_SOL / 10);

  const cortex = new Cortex({
    rpcUrl: cfg.rpcUrl,
    agent,
    owner,
    programId: cfg.programId,
  });

  // Step 1: ensure wallet exists.
  const existing = await cortex.getWalletState();
  if (!existing) {
    console.log(`[agent] creating wallet…`);
    const sig = await cortex.createWallet({
      mint,
      perCallLimit: PER_CALL,
      dailyLimit: DAILY,
    });
    console.log(`[agent]   ${solscanUrl(sig, cfg.cluster)}`);
  } else {
    console.log(`[agent] wallet ready ${existing.publicKey.toBase58()}`);
  }

  // Step 2: top up vault if low.
  const vaultBefore = await cortex.getVaultBalance();
  if (vaultBefore < BigInt(TOP_UP_LAMPORTS)) {
    const need = BigInt(TOP_UP_LAMPORTS) - vaultBefore;
    console.log(`[agent] topping up vault by ${microUsdc(Number(need))}`);
    const sig = await cortex.depositUsdc(need);
    console.log(`[agent]   ${solscanUrl(sig, cfg.cluster)}`);
  }

  return { cortex, agent, owner, cluster: cfg.cluster, mint };
}

async function smokeTestRun(cortex: Cortex, cluster: string): Promise<void> {
  const skills = await cortex.discoverSkills();
  console.log(`[agent] discovered ${skills.length} skill(s):`);
  for (const s of skills) {
    console.log(
      `  - ${s.slug.padEnd(24)} ${microUsdc(s.pricePerCall)}  (${s.name})`
    );
  }

  let settled = 0;
  for (const skill of skills) {
    console.log("");
    console.log(
      `[agent] >> calling ${skill.slug} @ ${microUsdc(skill.pricePerCall)}`
    );
    try {
      // Most skills in our seed config have placeholder
      // `https://example.com/...` manifest URIs, so we skip the HTTP
      // step for those. For real endpoints (cortex-search-live →
      // /api/skills/cortex-search), we trigger the full path so the
      // gateway middleware verifies the on-chain proof end-to-end.
      const isLive = !skill.manifestUri.startsWith("https://example.com/");
      const result = await cortex.payForCall(skill.slug, {
        input: `Demo run for ${skill.slug}`,
        fetchEndpoint: isLive,
      });
      console.log(
        `[agent]    settled  ${solscanUrl(result.signature, cluster)}`
      );
      if (isLive) {
        if (result.endpointReached) {
          console.log(
            `[agent]    endpoint reached (HTTP ${result.endpointStatus ?? "?"}) — ${skill.manifestUri}`
          );
        } else {
          console.log(
            `[agent]    endpoint unreachable — ${skill.manifestUri} (settle still valid)`
          );
        }
      }
      settled += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Catch the on-chain spending-policy errors — they're features
      // working correctly, not bugs. Stop the run instead of crashing.
      if (
        msg.includes("DailyLimitExceeded") ||
        msg.includes("PerCallLimitExceeded") ||
        msg.includes("InsufficientVaultBalance")
      ) {
        console.log(
          `[agent]    blocked by on-chain policy: ${msg.split("\n")[0]}`
        );
        console.log(
          `[agent]    (this is the Cortex spending-policy doing its job — agent stopped automatically)`
        );
        break;
      }
      throw err;
    }
  }
  console.log(`\n[agent] settled ${settled}/${skills.length} skill calls.`);
}

async function llmRun(cortex: Cortex, cluster: string): Promise<void> {
  console.log("[agent] ANTHROPIC_API_KEY detected — running real LLM agent.");
  // Lazy-load LangChain so the smoke-test path doesn't need it installed.
  const [{ ChatAnthropic }, { AgentExecutor, createToolCallingAgent }, prompt] =
    await Promise.all([
      import("@langchain/anthropic"),
      import("langchain/agents"),
      import("@langchain/core/prompts").then((m) =>
        m.ChatPromptTemplate.fromMessages([
          [
            "system",
            [
              "You are a research agent powered by Cortex on Solana.",
              "You have access to a marketplace of paid skills. Each skill",
              "settles in USDC on-chain. Your goal is to answer the user's",
              "question by chaining 2-3 skills. Always think step-by-step,",
              "pay only what's necessary, and cite the on-chain settle",
              "signature returned by each tool. Keep responses tight.",
            ].join(" "),
          ],
          ["human", "{input}"],
          ["placeholder", "{agent_scratchpad}"],
        ])
      ),
    ]);

  const { cortexLangChainTools } = await import("cortex-sdk/langchain");

  // The SDK returns its public structural type for portability; the
  // actual objects are real LangChain DynamicStructuredTool instances,
  // but LangChain's createToolCallingAgent + AgentExecutor accept
  // different overlapping types, so we erase types at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = await cortexLangChainTools(cortex, {
    // Endpoints in our seed are placeholders — flip this to true once
    // any of the skills hosts a real HTTP endpoint.
    fetchEndpoint: false,
  });

  const llm = new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929",
    temperature: 0,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const agent = createToolCallingAgent({ llm, tools, prompt });
  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
    returnIntermediateSteps: true,
    maxIterations: 5,
  });

  const task =
    process.env.CORTEX_TASK ??
    "Find the current SOL/USD price, then summarise the latest agentic-payments news in 3 bullets.";
  console.log(`[agent] task: ${task}`);

  const result = await executor.invoke({ input: task });

  console.log("");
  console.log("[agent] === intermediate steps ===");
  for (const step of result.intermediateSteps ?? []) {
    const tool = step.action?.tool ?? "?";
    const toolInput = step.action?.toolInput ?? {};
    let observation: unknown;
    try {
      observation = JSON.parse(step.observation ?? "{}");
    } catch {
      observation = step.observation;
    }
    const sig =
      typeof observation === "object" &&
      observation !== null &&
      "signature" in observation
        ? (observation as { signature: string }).signature
        : null;
    console.log(`[agent]  ↪ ${tool}(${JSON.stringify(toolInput)})`);
    if (sig) {
      console.log(`[agent]    settled ${solscanUrl(sig, cluster)}`);
    }
  }

  console.log("");
  console.log("[agent] === final answer ===");
  console.log(result.output ?? result);
}

async function main() {
  const { cortex, cluster } = await bootstrap();

  if (process.env.ANTHROPIC_API_KEY) {
    await llmRun(cortex, cluster);
  } else {
    console.log(
      "[agent] no ANTHROPIC_API_KEY — running deterministic smoke test."
    );
    console.log(
      "[agent] export ANTHROPIC_API_KEY=… to switch on real LLM tool-use."
    );
    await smokeTestRun(cortex, cluster);
  }

  // Final state.
  console.log("");
  console.log("[agent] === run summary ===");
  const finalWallet = await cortex.getWalletState();
  console.log(
    `[agent] total calls (lifetime): ${finalWallet?.totalCalls.toString() ?? "?"}`
  );
  console.log(
    `[agent] total spent (lifetime): ${microUsdc(finalWallet?.totalSpent ?? 0)}`
  );
  console.log(
    `[agent] daily spent           : ${microUsdc(
      finalWallet?.dailySpent ?? 0
    )} / ${microUsdc(finalWallet?.dailyLimit ?? 0)}`
  );
  const vaultAfter = await cortex.getVaultBalance();
  console.log(
    `[agent] vault balance         : ${microUsdc(Number(vaultAfter))}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
