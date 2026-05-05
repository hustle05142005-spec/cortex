/**
 * Model Context Protocol (MCP) integration for Cortex.
 *
 * Each registered Cortex skill becomes an MCP tool. When the LLM
 * runtime (Claude Desktop, Cursor, Cline, etc.) calls the tool, the
 * server settles `pay_for_call` on-chain, optionally hits the skill's
 * HTTP endpoint with `X-Cortex-Payment` proof, and returns the
 * response — all in a single MCP `tools/call` round-trip.
 *
 * Usage as a stdio server:
 *
 *   #!/usr/bin/env node
 *   import { Cortex } from "cortex-sdk";
 *   import { startCortexMcpServer } from "cortex-sdk/mcp";
 *
 *   const cortex = new Cortex({ rpcUrl, agent: loadKeypair() });
 *   await startCortexMcpServer(cortex);
 *
 * Then in Claude Desktop's `claude_desktop_config.json`:
 *
 *   {
 *     "mcpServers": {
 *       "cortex": {
 *         "command": "node",
 *         "args": ["/abs/path/to/cortex-mcp.mjs"]
 *       }
 *     }
 *   }
 *
 * Restart Claude Desktop and every Cortex skill becomes a tool the
 * model can pick. Each invocation = one on-chain USDC settle on
 * Solana.
 */
import type { Cortex, SkillFilter } from "./cortex";

export type CortexMcpOptions = SkillFilter & {
  /** Server identity reported to the MCP client. */
  serverName?: string;
  /** Server version reported to the MCP client. */
  serverVersion?: string;
  /** Pass-through to `payForCall`. Default: true (call the skill endpoint). */
  fetchEndpoint?: boolean;
  /**
   * Override the per-skill MCP tool description. Default: the on-chain
   * description plus the price-per-call.
   */
  describeTool?: (skill: {
    slug: string;
    name: string;
    description: string;
    pricePerCall: string;
  }) => string;
};

/**
 * Build an unstarted MCP `Server` instance with one tool per Cortex
 * skill. Use `startCortexMcpServer` if you just want a stdio server.
 *
 * Requires `@modelcontextprotocol/sdk` to be installed.
 */
export async function buildCortexMcpServer(
  cortex: Cortex,
  opts: CortexMcpOptions = {}
): Promise<{
  server: McpLikeServer;
  tools: CortexMcpTool[];
}> {
  const skills = await cortex.discoverSkills(opts);

  // Two distinct slugs can sanitise to the same MCP tool name (e.g.
  // `my-tool` and `my_tool` both become `my_tool`). Append a short
  // hash suffix on the second-and-later collision so every skill
  // stays addressable from MCP without the on-chain slug having to
  // change.
  const seen = new Map<string, number>();
  const tools: CortexMcpTool[] = skills.map((skill) => {
    const base = toolName(skill.slug);
    const collisionIdx = seen.get(base) ?? 0;
    seen.set(base, collisionIdx + 1);
    const name = collisionIdx === 0 ? base : `${base}_${slugSuffix(skill.slug)}`;
    return {
      name,
      slug: skill.slug,
      description:
        opts.describeTool?.({
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          pricePerCall: formatUsdc(skill.pricePerCall.toNumber()),
        }) ??
        `${skill.description} — paid Cortex skill, ${formatUsdc(
          skill.pricePerCall.toNumber()
        )} per call. Settles on-chain in USDC on Solana.`,
      inputSchema: {
        type: "object" as const,
        properties: {
          input: {
            type: "string",
            description: `Input to pass to the ${skill.name} skill. Plain string or JSON-encoded.`,
          },
        },
        required: ["input"],
      },
    };
  });

  // Lazy-load the MCP SDK so it stays an optional peer dep.
  const sdk = await import("@modelcontextprotocol/sdk/server/index.js");
  const types = await import("@modelcontextprotocol/sdk/types.js");

  const server = new sdk.Server(
    {
      name: opts.serverName ?? "cortex",
      version: opts.serverVersion ?? "0.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(types.ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(
    types.CallToolRequestSchema,
    async (req: McpCallToolRequest) => {
      const tool = tools.find((t) => t.name === req.params.name);
      if (!tool) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Unknown Cortex tool: ${req.params.name}`,
            },
          ],
        };
      }

      const args = (req.params.arguments ?? {}) as { input?: string };
      const input = typeof args.input === "string" ? args.input : "";

      try {
        const result = await cortex.payForCall(tool.slug, {
          input,
          fetchEndpoint: opts.fetchEndpoint !== false,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  skill: tool.slug,
                  signature: result.signature,
                  pricePaid: result.pricePaid.toString(),
                  endpointReached: result.endpointReached,
                  endpointStatus: result.endpointStatus,
                  response:
                    result.response ??
                    "[skill endpoint unreachable — on-chain settle complete]",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Cortex error calling ${tool.slug}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
          ],
        };
      }
    }
  );

  return { server: server as unknown as McpLikeServer, tools };
}

/**
 * Start a Cortex MCP server on stdio. Drop this into a tiny binary
 * file and point Claude Desktop / Cursor / Cline at it.
 */
export async function startCortexMcpServer(
  cortex: Cortex,
  opts: CortexMcpOptions = {}
): Promise<void> {
  const { server } = await buildCortexMcpServer(cortex, opts);
  const stdio = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const transport = new stdio.StdioServerTransport();
  await server.connect(transport);
}

export type CortexMcpTool = {
  name: string;
  slug: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
};

// Minimal structural types for the MCP SDK so we don't pull its full
// type surface into our public exports.
type McpLikeServer = {
  setRequestHandler: (
    schema: unknown,
    handler: (req: never) => unknown
  ) => void;
  connect: (transport: unknown) => Promise<void>;
};

type McpCallToolRequest = {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
};

function toolName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_]/g, "_");
}

// Deterministic short suffix derived from the original slug. Used to
// disambiguate distinct slugs that sanitise to the same `toolName`.
// Same slug always produces the same suffix, so MCP clients can
// stably address the right skill across server restarts.
function slugSuffix(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

function formatUsdc(microUsdc: number): string {
  return `${(microUsdc / 1e6).toFixed(3)} USDC`;
}
