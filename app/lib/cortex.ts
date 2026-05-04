/**
 * Helpers for creating a read-only CortexClient inside the Next.js app.
 * Browser code should never sign with the demo keypair — this client is
 * only used to fetch on-chain state.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { CortexClient } from "../../sdk/src";

export const CORTEX_RPC_URL =
  process.env.NEXT_PUBLIC_CORTEX_RPC_URL ?? "https://api.devnet.solana.com";

export const CORTEX_CLUSTER =
  process.env.NEXT_PUBLIC_CORTEX_CLUSTER ?? "devnet";

export const CORTEX_PROGRAM_ID =
  process.env.NEXT_PUBLIC_CORTEX_PROGRAM_ID ??
  "DBUXLUHZk8UEGJgdbAAaazTuLoCKbReDF1tNPa5fMprV";

export const DEMO_AGENT_PUBKEY = process.env.NEXT_PUBLIC_DEMO_AGENT_PUBKEY;

class ReadOnlyWallet {
  readonly payer: Keypair;
  constructor() {
    this.payer = Keypair.generate();
  }
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
  async signTransaction<
    T extends Transaction | VersionedTransaction,
  >(): Promise<T> {
    throw new Error(
      "ReadOnlyWallet cannot sign — use a connected wallet for transactions"
    );
  }
  async signAllTransactions<
    T extends Transaction | VersionedTransaction,
  >(): Promise<T[]> {
    throw new Error(
      "ReadOnlyWallet cannot sign — use a connected wallet for transactions"
    );
  }
}

export function createReadOnlyCortexClient(): CortexClient {
  const connection = new Connection(CORTEX_RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new ReadOnlyWallet(), {
    commitment: "confirmed",
  });
  return new CortexClient(provider, {
    programId: new PublicKey(CORTEX_PROGRAM_ID),
  });
}

export function solscanTxUrl(sig: string): string {
  if (CORTEX_CLUSTER === "mainnet-beta") return `https://solscan.io/tx/${sig}`;
  return `https://solscan.io/tx/${sig}?cluster=${CORTEX_CLUSTER}`;
}

export function solscanAddrUrl(addr: string): string {
  if (CORTEX_CLUSTER === "mainnet-beta")
    return `https://solscan.io/account/${addr}`;
  return `https://solscan.io/account/${addr}?cluster=${CORTEX_CLUSTER}`;
}

export function shortAddr(addr: string, n = 4): string {
  if (addr.length <= 2 * n + 1) return addr;
  return `${addr.slice(0, n)}…${addr.slice(-n)}`;
}

export function formatToken(
  amount: bigint | number | string,
  decimals = 6
): string {
  const big =
    typeof amount === "bigint"
      ? amount
      : typeof amount === "number"
        ? BigInt(amount)
        : BigInt(amount);
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
