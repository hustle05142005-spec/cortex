/**
 * Devnet-only USDC faucet.
 *
 * POST /api/faucet/devusdc { ownerPubkey: string, amount?: number }
 *
 * Mints `amount` (default 5) devUSDC to the requested owner's ATA, using
 * the seed-script's mint-authority keypair. Server-only — the secret
 * key never leaves the server.
 *
 * Requires CORTEX_FAUCET_AUTHORITY env var set to a JSON-array secret
 * key (the same format `solana-keygen` writes). On Vercel this would
 * live in the project's "Environment Variables" panel, scoped to
 * Production + Preview + Development.
 *
 * Returns 503 if not configured (so the dashboard can render a useful
 * "ask the org admin" message instead of silently breaking).
 */
import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

const RPC_URL =
  process.env.CORTEX_RPC_URL ??
  process.env.NEXT_PUBLIC_CORTEX_RPC_URL ??
  "https://api.devnet.solana.com";

const MINT =
  process.env.CORTEX_MINT ??
  process.env.NEXT_PUBLIC_CORTEX_MINT ??
  "9QtDZ1ojHg8UtUtcxjzZ2Xb24Z8vRJ3vEiVgBSAskpn5";

const DECIMALS = 6;
const MAX_PER_REQUEST_USDC = 25; // hard cap so a leaked endpoint can't drain the mint
const DEFAULT_USDC = 5;

function loadAuthority(): Keypair | null {
  const raw = process.env.CORTEX_FAUCET_AUTHORITY;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const authority = loadAuthority();
  if (!authority) {
    return NextResponse.json(
      {
        error:
          "Faucet not configured. Set CORTEX_FAUCET_AUTHORITY env var with the mint-authority secret key (JSON array).",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ownerPubkeyStr =
    body && typeof body === "object" && "ownerPubkey" in body
      ? (body as { ownerPubkey?: string }).ownerPubkey
      : undefined;
  const requested =
    body && typeof body === "object" && "amount" in body
      ? Number((body as { amount?: number }).amount)
      : DEFAULT_USDC;

  if (!ownerPubkeyStr || typeof ownerPubkeyStr !== "string") {
    return NextResponse.json(
      { error: "ownerPubkey required" },
      { status: 400 }
    );
  }

  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerPubkeyStr);
  } catch {
    return NextResponse.json({ error: "Invalid ownerPubkey" }, { status: 400 });
  }

  const amount = Math.min(
    Math.max(Number.isFinite(requested) ? requested : DEFAULT_USDC, 1),
    MAX_PER_REQUEST_USDC
  );

  const connection = new Connection(RPC_URL, "confirmed");
  const mint = new PublicKey(MINT);
  const ownerAta = getAssociatedTokenAddressSync(mint, owner);

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      ownerAta,
      owner,
      mint
    )
  );
  tx.add(
    createMintToCheckedInstruction(
      mint,
      ownerAta,
      authority.publicKey,
      BigInt(Math.round(amount * 10 ** DECIMALS)),
      DECIMALS
    )
  );

  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [
      authority,
    ]);
    return NextResponse.json({
      ok: true,
      signature,
      amount,
      mint: MINT,
      ownerAta: ownerAta.toBase58(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
