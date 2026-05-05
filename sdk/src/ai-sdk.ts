/**
 * Vercel AI SDK integration for Cortex.
 *
 * Each registered Cortex skill becomes an `ai.tool()` definition. The
 * tool's `execute` settles `pay_for_call` on-chain, optionally invokes
 * the skill's HTTP endpoint, and returns the response.
 *
 * Usage:
 *
 *   import { generateText } from "ai";
 *   import { anthropic } from "@ai-sdk/anthropic";
 *   import { Cortex } from "cortex-sdk";
 *   import { cortexAiTools } from "cortex-sdk/ai-sdk";
 *
 *   const cortex = new Cortex({ rpcUrl, agent });
 *   const tools = await cortexAiTools(cortex, { slugs: ["demo-summarize"] });
 *
 *   const { text } = await generateText({
 *     model: anthropic("claude-sonnet-4-5"),
 *     prompt: "Summarise the latest Solana news in 3 bullets.",
 *     tools,
 *     maxSteps: 5,
 *   });
 */
import type { Cortex, SkillFilter } from "./cortex";

export type CortexAiToolsOptions = SkillFilter & {
  /** Pass-through to `payForCall` per invocation. Default: true. */
  fetchEndpoint?: boolean;
};

/**
 * Build a record of Vercel AI SDK tools (one per Cortex skill). Returns
 * an object suitable for the `tools` field of `generateText` /
 * `streamText`.
 *
 * Requires `ai` and `zod` to be installed in the consumer.
 */
export async function cortexAiTools(
  cortex: Cortex,
  opts: CortexAiToolsOptions = {}
): Promise<Record<string, unknown>> {
  const [{ tool }, { z }] = await Promise.all([import("ai"), import("zod")]);

  const skills = await cortex.discoverSkills(opts);

  const tools: Record<string, unknown> = {};
  for (const skill of skills) {
    const name = toolName(skill.slug);
    tools[name] = tool({
      description: `${skill.description} (paid Cortex skill, ${formatUsdc(
        skill.pricePerCall.toNumber()
      )} per call — settles on-chain in USDC).`,
      parameters: z.object({
        input: z
          .string()
          .describe(
            `Input to pass to the ${skill.name} skill. Plain string or JSON-encoded.`
          ),
      }),
      execute: async ({ input }: { input: string }) => {
        const result = await cortex.payForCall(skill.slug, {
          input,
          fetchEndpoint: opts.fetchEndpoint,
        });
        return {
          skill: skill.slug,
          signature: result.signature,
          pricePaid: result.pricePaid.toString(),
          response:
            result.response ??
            "[skill endpoint unreachable — payment settled on-chain]",
          endpointReached: result.endpointReached,
        };
      },
    });
  }
  return tools;
}

function toolName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_]/g, "_");
}

function formatUsdc(microUsdc: number): string {
  return `${(microUsdc / 1e6).toFixed(3)} USDC`;
}
