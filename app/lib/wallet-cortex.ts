/**
 * Build a `CortexClient` whose owner-side signer is the connected
 * browser wallet (Phantom, Solflare, etc.) instead of a Keypair on
 * disk. Used by the dashboard for owner-side operations:
 * createAgentWallet, deposit, withdraw, updateLimits, registerSkill.
 *
 * For agent-side operations (pay_for_call), a separate Keypair signs
 * automatically — see `app/lib/agent-keypair.ts`.
 */
import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { CortexClient } from "../../sdk/src";
import { CORTEX_PROGRAM_ID } from "./cortex";

export function buildOwnerClient(
  connection: Connection,
  wallet: AnchorWallet
): CortexClient {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new CortexClient(provider, {
    programId: new PublicKey(CORTEX_PROGRAM_ID),
  });
}
