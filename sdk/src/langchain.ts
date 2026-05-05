/**
 * LangChain integration for Cortex.
 *
 * Each registered Cortex skill becomes a LangChain `DynamicStructuredTool`.
 * The tool's `func` settles `pay_for_call` on-chain, optionally invokes
 * the skill's HTTP endpoint with `X-Cortex-Payment` proof, and returns
 * the response.
 *
 * Usage:
 *
 *   import { Cortex } from "cortex-sdk";
 *   import { cortexLangChainTools } from "cortex-sdk/langchain";
 *   import { ChatAnthropic } from "@langchain/anthropic";
 *   import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
 *
 *   const cortex = new Cortex({ rpcUrl, agent });
 *   const tools = await cortexLangChainTools(cortex, { slugs: ["demo-summarize", "demo-web-search"] });
 *
 *   const agent = createToolCallingAgent({ llm: new ChatAnthropic({...}), tools, prompt });
 *   const executor = new AgentExecutor({ agent, tools });
 *   await executor.invoke({ input: "Summarise the latest Solana stablecoin news." });
 *
 * Each tool invocation results in a real on-chain USDC transfer plus
 * (if `fetchEndpoint` is true) an HTTP call to the skill's endpoint.
 */
import type { Cortex, SkillFilter } from "./cortex";

/**
 * Structural alias for a LangChain `DynamicStructuredTool`. Avoids
 * pulling the full generic type into our public surface so type
 * inference stays cheap and the consumer's LangChain version doesn't
 * have to match the SDK's exactly.
 */
export type CortexLangChainTool = {
  name: string;
  description: string;
  invoke: (input: { input: string }) => Promise<string>;
};

export type CortexLangChainOptions = SkillFilter & {
  /** Override the default tool description with a custom builder. */
  describeTool?: (skill: {
    slug: string;
    name: string;
    description: string;
    pricePerCall: string;
  }) => string;
  /** Pass-through to `payForCall` per invocation. Default: true. */
  fetchEndpoint?: boolean;
};

/**
 * Build LangChain tools backed by Cortex skills.
 *
 * Returns a typed array of `DynamicStructuredTool`s. Requires
 * `@langchain/core` and `zod` to be installed in the consumer.
 */
export async function cortexLangChainTools(
  cortex: Cortex,
  opts: CortexLangChainOptions = {}
): Promise<CortexLangChainTool[]> {
  // Lazy-load to keep these as optional peer deps.
  const [{ DynamicStructuredTool }, { z }] = await Promise.all([
    import("@langchain/core/tools"),
    import("zod"),
  ]);

  const skills = await cortex.discoverSkills(opts);

  // The DynamicStructuredTool generic is famously deep — the same
  // schema flows back into several conditional types that TypeScript
  // can't always solve in time. Casting the constructor through
  // `unknown` keeps the public surface clean (we only expose
  // `CortexLangChainTool`) and avoids the deep-instantiation error.
  const Ctor = DynamicStructuredTool as unknown as new (
    cfg: unknown
  ) => CortexLangChainTool;

  return skills.map(
    (skill) =>
      new Ctor({
        name: toolName(skill.slug),
        description:
          opts.describeTool?.({
            slug: skill.slug,
            name: skill.name,
            description: skill.description,
            pricePerCall: formatUsdc(skill.pricePerCall.toNumber()),
          }) ??
          `${skill.description} — paid Cortex skill, ${formatUsdc(
            skill.pricePerCall.toNumber()
          )} per call. Settles on-chain in USDC.`,
        schema: z.object({
          input: z
            .string()
            .describe(
              `Input to pass to the ${skill.name} skill. Plain string or JSON-encoded.`
            ),
        }),
        func: async ({ input }: { input: string }) => {
          const result = await cortex.payForCall(skill.slug, {
            input,
            fetchEndpoint: opts.fetchEndpoint,
          });
          return JSON.stringify({
            skill: skill.slug,
            signature: result.signature,
            pricePaid: result.pricePaid.toString(),
            response:
              result.response ??
              "[skill endpoint unreachable — payment settled on-chain]",
            endpointReached: result.endpointReached,
          });
        },
      })
  );
}

function toolName(slug: string): string {
  // LangChain tool names should be alpha-numeric + underscores.
  return slug.replace(/[^a-zA-Z0-9_]/g, "_");
}

function formatUsdc(microUsdc: number): string {
  return `${(microUsdc / 1e6).toFixed(3)} USDC`;
}
