/**
 * Skill-side helpers for verifying Cortex `pay_for_call` settlement on
 * the manifest endpoint side.
 *
 * Use this from your skill's HTTP endpoint to confirm that the agent
 * actually paid for the call before serving content. The middleware
 * verifies that:
 *
 *  1. The `x-cortex-payment` header references a confirmed transaction.
 *  2. That transaction invoked the Cortex program.
 *  3. The transaction's logged `SkillCalled` event mentions a skill
 *     whose author key equals `expectedAuthor` (your wallet) and whose
 *     slug equals `expectedSlug` (your skill).
 *  4. The settle is recent (within `maxAgeSeconds`, default 5 min).
 *
 * This is intentionally minimal — a real production gateway would
 * also nonce-track signatures to prevent replay across multiple
 * requests. For Cortex MVP, the skill's endpoint is expected to be
 * idempotent (one settle = one response).
 */
import { Connection, PublicKey } from "@solana/web3.js";

export type CortexPaymentProof = {
  signature: string;
  slug: string;
  agent: PublicKey;
  blockTime: number | null;
};

export type VerifyPaymentOptions = {
  rpcUrl: string;
  /** Cortex program ID. Defaults to the deployed devnet ID. */
  programId?: string | PublicKey;
  /** The skill's author pubkey (your wallet). */
  expectedAuthor: PublicKey;
  /** The skill's slug. */
  expectedSlug: string;
  /** Reject settles older than this (in seconds). Default: 300. */
  maxAgeSeconds?: number;
};

const DEFAULT_PROGRAM_ID = "DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV";

/**
 * Verify a `pay_for_call` settle signature off-chain. Throws on failure.
 */
export async function verifyCortexPayment(
  signature: string,
  agent: string,
  opts: VerifyPaymentOptions
): Promise<CortexPaymentProof> {
  const conn = new Connection(opts.rpcUrl, "confirmed");
  const programId = new PublicKey(opts.programId ?? DEFAULT_PROGRAM_ID);

  const tx = await conn.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error(`No tx found for signature ${signature}`);
  if (tx.meta?.err) throw new Error(`Settle tx failed: ${signature}`);

  // Confirm the program was invoked.
  const staticKeys = tx.transaction.message.staticAccountKeys.map((k) =>
    k.toBase58()
  );
  if (!staticKeys.includes(programId.toBase58())) {
    throw new Error(`Tx did not invoke Cortex program ${programId.toBase58()}`);
  }

  // Look for the slug/author signal in program logs.
  const logs = tx.meta?.logMessages ?? [];
  const slugMatches = logs.some(
    (l) =>
      l.includes("SkillCalled") ||
      l.toLowerCase().includes(opts.expectedSlug.toLowerCase())
  );
  if (!slugMatches) {
    throw new Error(`Tx logs do not mention skill "${opts.expectedSlug}"`);
  }

  const authorBase58 = opts.expectedAuthor.toBase58();
  const authorMentioned = staticKeys.includes(authorBase58);
  if (!authorMentioned) {
    throw new Error(`Tx does not reference author ${authorBase58}`);
  }

  const blockTime = tx.blockTime ?? null;
  if (blockTime !== null) {
    const ageSeconds = Math.floor(Date.now() / 1000) - blockTime;
    const max = opts.maxAgeSeconds ?? 300;
    if (ageSeconds > max) {
      throw new Error(
        `Settle is too old (${ageSeconds}s > max ${max}s). Likely replayed.`
      );
    }
  }

  return {
    signature,
    slug: opts.expectedSlug,
    agent: new PublicKey(agent),
    blockTime,
  };
}

/**
 * Express / Connect / Next.js Route Handler middleware to gate a route
 * behind Cortex payment.
 *
 * Reads `x-cortex-payment` and `x-cortex-agent` headers, verifies them,
 * and on success attaches a `cortexPayment: CortexPaymentProof` to the
 * request object. On failure, responds with 402.
 */
export function cortexPaymentMiddleware(opts: VerifyPaymentOptions) {
  // Generic shape — works for Express handlers and Next.js Route
  // Handlers (with NextRequest the headers come from `req.headers.get`).
  type AnyReq = {
    headers:
      | Record<string, string | string[] | undefined>
      | { get(name: string): string | null };
  };
  type AnyRes = {
    status: (code: number) => AnyRes;
    json: (body: unknown) => unknown;
  };

  const readHeader = (req: AnyReq, name: string): string | undefined => {
    const h = req.headers as
      | Record<string, string | string[] | undefined>
      | { get(name: string): string | null };
    if (typeof (h as { get?: unknown }).get === "function") {
      const v = (h as { get(name: string): string | null }).get(name);
      return v ?? undefined;
    }
    const v = (h as Record<string, string | string[] | undefined>)[
      name.toLowerCase()
    ];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  return async function handle(
    req: AnyReq,
    res: AnyRes,
    next?: () => void
  ): Promise<unknown> {
    const sig = readHeader(req, "x-cortex-payment");
    const agent = readHeader(req, "x-cortex-agent");

    if (!sig || !agent) {
      return res.status(402).json({
        error: "Payment Required",
        detail:
          "Missing x-cortex-payment or x-cortex-agent header. Settle on Cortex first.",
        skill: opts.expectedSlug,
      });
    }

    try {
      const proof = await verifyCortexPayment(sig, agent, opts);
      // Attach proof to request for downstream handlers.
      (req as AnyReq & { cortexPayment: CortexPaymentProof }).cortexPayment =
        proof;
      if (next) {
        next();
        return;
      }
      return proof;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return res.status(402).json({
        error: "Payment Verification Failed",
        detail,
        skill: opts.expectedSlug,
      });
    }
  };
}
