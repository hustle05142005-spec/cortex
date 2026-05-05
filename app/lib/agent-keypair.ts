/**
 * Browser-side store for per-owner agent keypairs.
 *
 * Each connected owner gets a fresh agent signing keypair, persisted in
 * localStorage so the same agent PDA is reused across sessions. The
 * agent key is **only** the operational signer — its capability is
 * limited by the on-chain `per_call_limit` and `daily_limit`. Even if
 * leaked, the worst case is the daily cap until the owner withdraws.
 */
import { Keypair } from "@solana/web3.js";

const PREFIX = "cortex.agent.v1";

function key(ownerPubkey: string): string {
  return `${PREFIX}.${ownerPubkey}`;
}

export function loadAgentKeypair(ownerPubkey: string): Keypair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(ownerPubkey));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
  } catch {
    return null;
  }
}

export function loadOrCreateAgentKeypair(ownerPubkey: string): Keypair {
  const existing = loadAgentKeypair(ownerPubkey);
  if (existing) return existing;
  const fresh = Keypair.generate();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      key(ownerPubkey),
      JSON.stringify(Array.from(fresh.secretKey))
    );
  }
  return fresh;
}

/** Wipe the stored agent keypair for `owner`. Useful after `close_agent_wallet`. */
export function clearAgentKeypair(ownerPubkey: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(ownerPubkey));
}
