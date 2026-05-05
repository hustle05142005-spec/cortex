/**
 * Runnable Cortex MCP server. Bridges the Cortex skill registry into
 * any Model Context Protocol runtime (Claude Desktop, Cursor, Cline,
 * Continue, etc.). Each Cortex skill becomes an MCP `tool/call`.
 *
 * Usage:
 *
 *   npm run mcp:server
 *
 *   # or, after compiling, drop into Claude Desktop's
 *   # `~/Library/Application Support/Claude/claude_desktop_config.json`:
 *
 *   {
 *     "mcpServers": {
 *       "cortex": {
 *         "command": "npx",
 *         "args": [
 *           "ts-node",
 *           "--project",
 *           "/abs/path/to/cortex/scripts/tsconfig.json",
 *           "/abs/path/to/cortex/scripts/mcp-server.ts"
 *         ]
 *       }
 *     }
 *   }
 *
 * Required env (or `config/demo-agent.json` next to a populated
 * `config/demo.json`):
 *   - CORTEX_RPC_URL
 *
 * The agent keypair is loaded from `config/demo-agent.json` so the
 * server signs `pay_for_call` ix on behalf of the LLM client.
 */
import { clusterApiUrl } from "@solana/web3.js";
import { Cortex } from "../sdk/src";
import { startCortexMcpServer } from "../sdk/src/mcp";
import { loadOrCreateKeypair, loadConfig } from "./lib/keys";

async function main() {
  const config = loadConfig();
  const rpcUrl =
    process.env.CORTEX_RPC_URL ?? config.rpcUrl ?? clusterApiUrl("devnet");
  const agent = loadOrCreateKeypair("demo-agent.json");

  const cortex = new Cortex({
    rpcUrl,
    agent,
    programId: config.programId,
  });

  // Note: we deliberately log to stderr so the stdio transport (stdout)
  // stays a clean MCP channel.
  console.error(`[cortex-mcp] cluster: ${rpcUrl}`);
  console.error(`[cortex-mcp] agent  : ${agent.publicKey.toBase58()}`);
  console.error(`[cortex-mcp] program: ${config.programId}`);

  await startCortexMcpServer(cortex, {
    serverName: "cortex",
    serverVersion: "0.2.0",
    fetchEndpoint: true,
  });
}

main().catch((err) => {
  console.error("[cortex-mcp] fatal:", err);
  process.exit(1);
});
