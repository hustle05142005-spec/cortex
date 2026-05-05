/**
 * Curated list of popular open-source agent-skill libraries.
 *
 * These are NOT yet on-chain. The marketplace shows them as
 * "unclaimed templates" with a CTA pointing the original maintainer
 * (or a fork-runner) to publish a Cortex skill that wraps the repo.
 *
 * Wrapping flow (post-MVP):
 *   1. Maintainer adds a `cortex.toml` to the repo's main branch
 *      with their Solana pubkey + price-per-call.
 *   2. They run `cortex publish`, which checks the file via the
 *      GitHub API and calls `register_skill` with the verified
 *      author pubkey.
 *   3. The card flips from "unclaimed" to "live" once the on-chain
 *      account exists.
 *
 * No royalties are paid for unclaimed templates — listing here is a
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
  {
    slug: "openai-whisper",
    name: "Whisper Transcribe",
    category: "Audio → Text",
    repo: "openai/whisper",
    stars: "70k",
    blurb:
      "OpenAI's open-source speech-to-text model. Wrap the inference endpoint and charge per audio-second.",
    suggestedPrice: 100_000,
  },
  {
    slug: "firecrawl",
    name: "Firecrawl",
    category: "Web → Markdown",
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
      "Reference Model Context Protocol servers — filesystem, git, postgres, slack, etc. Each one becomes a Cortex skill.",
    suggestedPrice: 30_000,
  },
  {
    slug: "stagehand",
    name: "Stagehand",
    category: "Browser automation",
    repo: "browserbase/stagehand",
    stars: "3k",
    blurb:
      "AI-native browser actions. Charge per visited page or per goal-completion.",
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
    category: "Text → Audio",
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
      "Search API tuned for AI agents — fewer ads, higher signal. Charge per query.",
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
];
