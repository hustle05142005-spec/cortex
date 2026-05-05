/**
 * Curated list of popular open-source skill libraries that pair well
 * with Cortex.
 *
 * These are NOT yet on-chain. The marketplace shows them as "unclaimed
 * templates" with a CTA pointing the maintainer (or a fork-runner) to
 * publish a Cortex skill that wraps the repo.
 *
 * Wrap flow (post-MVP):
 *   1. Maintainer adds a `cortex.toml` to their repo's main branch
 *      with their Solana pubkey, slug, and price-per-call.
 *   2. They run `cortex publish`, which checks the file via the optional
 *      `verify_url` and calls `register_skill` with the verified author
 *      pubkey.
 *   3. The card flips from "unclaimed" to "live" once the on-chain
 *      account exists.
 *
 * No royalties are paid for unclaimed templates. Listing here is a
 * recruiting surface, not an IP claim.
 */
export type FeaturedTemplate = {
  slug: string;
  name: string;
  category: string;
  repo: string; // owner/name
  stars: string; // human-readable, e.g. "70k"
  blurb: string;
  suggestedPrice: number; // micro-USDC per call
};

export const FEATURED_TEMPLATES: FeaturedTemplate[] = [
  // ─── Agent toolchain (LLM, search, browse, audio) ──────────────────
  {
    slug: "openai-whisper",
    name: "Whisper Transcribe",
    category: "Audio → text",
    repo: "openai/whisper",
    stars: "70k",
    blurb:
      "OpenAI's open-source speech-to-text model. Wrap the inference endpoint and charge per audio-second.",
    suggestedPrice: 100_000,
  },
  {
    slug: "firecrawl",
    name: "Firecrawl",
    category: "Web → markdown",
    repo: "mendableai/firecrawl",
    stars: "17k",
    blurb:
      "LLM-friendly web scraping with one line of code. Charge per crawled page.",
    suggestedPrice: 80_000,
  },
  {
    slug: "mcp-servers",
    name: "MCP Servers",
    category: "Tool registry",
    repo: "modelcontextprotocol/servers",
    stars: "13k",
    blurb:
      "Reference Model Context Protocol servers (filesystem, git, postgres, slack). Each one becomes a Cortex skill.",
    suggestedPrice: 30_000,
  },
  {
    slug: "stagehand",
    name: "Stagehand",
    category: "Browser automation",
    repo: "browserbase/stagehand",
    stars: "3k",
    blurb:
      "AI-native browser actions. Charge per visited page or per goal completion.",
    suggestedPrice: 200_000,
  },
  {
    slug: "anthropic-sdk-python",
    name: "Claude SDK",
    category: "LLM inference",
    repo: "anthropics/anthropic-sdk-python",
    stars: "3k",
    blurb:
      "Official Anthropic Python SDK. Wrap a hosted Claude endpoint and charge per 1k tokens.",
    suggestedPrice: 60_000,
  },
  {
    slug: "elevenlabs",
    name: "ElevenLabs TTS",
    category: "Text → audio",
    repo: "elevenlabs/elevenlabs-python",
    stars: "1.5k",
    blurb:
      "Multilingual neural TTS. Charge per generated audio-second.",
    suggestedPrice: 120_000,
  },
  {
    slug: "tavily",
    name: "Tavily Search",
    category: "Web search",
    repo: "tavily-ai/tavily-python",
    stars: "600",
    blurb:
      "Search API tuned for AI agents (fewer ads, higher signal). Charge per query.",
    suggestedPrice: 90_000,
  },
  {
    slug: "exa",
    name: "Exa Semantic",
    category: "Web search",
    repo: "exa-labs/exa-py",
    stars: "300",
    blurb:
      "Embedding-based web search returning ranked passages. Charge per query.",
    suggestedPrice: 100_000,
  },
  // ─── Solana-native data / tooling skills ───────────────────────────
  {
    slug: "pyth-price-feed",
    name: "Pyth Price Feed",
    category: "Solana · oracle",
    repo: "pyth-network/pyth-client-py",
    stars: "2.5k",
    blurb:
      "Real-time price feeds with confidence intervals. Charge per quote.",
    suggestedPrice: 20_000,
  },
  {
    slug: "helius-das",
    name: "Helius DAS",
    category: "Solana · indexer",
    repo: "helius-labs/helius-sdk",
    stars: "400",
    blurb:
      "Digital Asset Standard reads, enhanced transactions, webhooks. Charge per query.",
    suggestedPrice: 25_000,
  },
  {
    slug: "jup-swap",
    name: "Jupiter Swap",
    category: "Solana · DeFi",
    repo: "jup-ag/jupiter-quote-api-node",
    stars: "1.2k",
    blurb:
      "Best-route swap quotes across every Solana DEX. Charge per quoted route.",
    suggestedPrice: 30_000,
  },
  {
    slug: "squads-multisig",
    name: "Squads Multisig",
    category: "Solana · multisig",
    repo: "Squads-Protocol/v4",
    stars: "200",
    blurb:
      "Account-abstraction multisig. Wrap propose / vote / execute as paid skills.",
    suggestedPrice: 80_000,
  },
];
