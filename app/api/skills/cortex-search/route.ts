/**
 * Live Cortex skill: cortex-search-live (route URL: /api/skills/cortex-search).
 *
 * Backed by Tavily's search API. Gated by `verifyCortexPayment` from
 * `cortex-sdk/gateway`. The agent's runtime first calls
 * `cortex.payForCall("cortex-search-live", { input, fetchEndpoint: true })`,
 * the SDK settles `pay_for_call` on-chain, then POSTs to *this*
 * endpoint with `x-cortex-payment` (signature) and `x-cortex-agent`
 * (agent pubkey) headers.
 *
 * This route:
 *   1. Verifies the payment proof on-chain (program invoked, slug
 *      matches, author matches, recent enough).
 *   2. Calls Tavily for actual search results.
 *   3. Returns JSON.
 *
 * Required env (server-side):
 *   - TAVILY_API_KEY        (from https://tavily.com — free tier OK)
 *   - CORTEX_SEARCH_AUTHOR  (base58 pubkey — the registered author key)
 *   - CORTEX_RPC_URL        (defaults to devnet)
 *
 * The route returns 503 with a clear hint if `TAVILY_API_KEY` is
 * missing — so the gateway flow can be exercised end-to-end on
 * devnet even before the key is wired up.
 */
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { verifyCortexPayment } from "../../../../sdk/src/gateway";

const TAVILY_URL = "https://api.tavily.com/search";

const RPC_URL =
  process.env.CORTEX_RPC_URL ??
  process.env.NEXT_PUBLIC_CORTEX_RPC_URL ??
  "https://api.devnet.solana.com";

const PROGRAM_ID =
  process.env.CORTEX_PROGRAM_ID ??
  process.env.NEXT_PUBLIC_CORTEX_PROGRAM_ID ??
  "DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV";

const SLUG = "cortex-search-live";

function authorPubkey(): PublicKey | null {
  const raw =
    process.env.CORTEX_SEARCH_AUTHOR ??
    process.env.NEXT_PUBLIC_CORTEX_SEARCH_AUTHOR;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const expectedAuthor = authorPubkey();
  if (!expectedAuthor) {
    return NextResponse.json(
      {
        error: "Skill misconfigured",
        detail:
          "Set CORTEX_SEARCH_AUTHOR env var to the base58 pubkey of the registered author.",
      },
      { status: 503 }
    );
  }

  const sig = req.headers.get("x-cortex-payment");
  const agent = req.headers.get("x-cortex-agent");
  if (!sig || !agent) {
    return NextResponse.json(
      {
        error: "Payment Required",
        detail:
          "Missing x-cortex-payment or x-cortex-agent header. Settle on Cortex first.",
        skill: SLUG,
      },
      { status: 402 }
    );
  }

  try {
    await verifyCortexPayment(sig, agent, {
      rpcUrl: RPC_URL,
      programId: PROGRAM_ID,
      expectedAuthor,
      expectedSlug: SLUG,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Payment Verification Failed",
        detail: err instanceof Error ? err.message : String(err),
        skill: SLUG,
      },
      { status: 402 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input =
    body && typeof body === "object" && "input" in body
      ? (body as { input?: unknown }).input
      : body;
  const query = typeof input === "string" ? input : JSON.stringify(input);
  if (!query) {
    return NextResponse.json(
      { error: "Empty query — pass `input: <search query>`" },
      { status: 400 }
    );
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    // Skill is "live on-chain" but the underlying provider isn't wired
    // up yet. Return a useful response so end-to-end x402 settlement is
    // still demonstrable.
    return NextResponse.json({
      skill: SLUG,
      query,
      provider: "tavily-stub",
      results: [
        {
          title: "Tavily not configured",
          url: "https://tavily.com",
          content:
            "Set TAVILY_API_KEY in the deployment env to return real results. The on-chain settlement and gateway verification still ran successfully.",
        },
      ],
      note: "TAVILY_API_KEY missing — on-chain settle verified but live search disabled.",
    });
  }

  const upstream = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      max_results: 5,
      include_answer: true,
      search_depth: "basic",
    }),
  });
  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: "Upstream Tavily error",
        status: upstream.status,
        detail: await upstream.text(),
      },
      { status: 502 }
    );
  }
  const data = (await upstream.json()) as {
    answer?: string;
    results?: Array<{ title: string; url: string; content: string }>;
  };

  return NextResponse.json({
    skill: SLUG,
    query,
    provider: "tavily",
    answer: data.answer ?? null,
    results: (data.results ?? []).slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    })),
  });
}
