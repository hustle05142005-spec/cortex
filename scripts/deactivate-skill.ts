/**
 * Deactivate (set `active = false`) a registered skill on devnet.
 * Use when a skill was mis-registered (wrong mint, typo, etc.) and
 * should no longer appear in `discoverSkills` defaults.
 *
 *   ts-node --project scripts/tsconfig.json scripts/deactivate-skill.ts <slug>
 */
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { CortexClient } from "../sdk/src";
import { loadOrCreateKeypair } from "./lib/keys";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("usage: deactivate-skill <slug>");
    process.exit(1);
  }

  const rpcUrl = process.env.CORTEX_RPC_URL ?? clusterApiUrl("devnet");
  const conn = new Connection(rpcUrl, "confirmed");
  const author = loadOrCreateKeypair("demo-author.json");

  const provider = new AnchorProvider(conn, new Wallet(author), {
    commitment: "confirmed",
  });
  const cortex = new CortexClient(provider);

  const existing = await cortex.fetchSkill(slug);
  if (!existing) {
    console.log(`[deactivate] skill ${slug} not found`);
    process.exit(0);
  }

  if (!existing.author.equals(author.publicKey)) {
    console.error(
      `[deactivate] skill ${slug} is owned by ${existing.author.toBase58()}, ` +
        `not the demo-author key. Refusing to update.`
    );
    process.exit(1);
  }

  if (!existing.active) {
    console.log(`[deactivate] skill ${slug} already inactive`);
    return;
  }

  const sig = await cortex
    .updateSkill(author.publicKey, slug, { active: false })
    .signers([author])
    .rpc();
  console.log(`[deactivate] ${slug} → active=false  tx=${sig}`);
  console.log(`             https://solscan.io/tx/${sig}?cluster=devnet`);
  // Mark the variable explicitly (avoid unused warnings)
  void new PublicKey(existing.publicKey.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
