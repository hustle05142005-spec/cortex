/**
 * Cortex demo agent.
 *
 * 1. Loads the seeded demo config.
 * 2. Ensures the agent wallet exists (per-call 0.1 devUSDC, daily 1 devUSDC).
 * 3. Tops up the vault from the owner's ATA if it's below 0.5 devUSDC.
 * 4. Iterates through registered skills and pays for one call to each.
 * 5. Prints solscan links for every on-chain settlement.
 *
 * Usage:
 *   npm run demo:seed     # one-time, sets up mint + skills
 *   npm run demo:agent    # run the agent
 */
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { CortexClient } from "../../sdk/src";
import {
  loadConfig,
  loadOrCreateKeypair,
  ensureFunded,
} from "../../scripts/lib/keys";

const PER_CALL = new BN(300_000); // 0.30 devUSDC — covers the priciest demo skill
const DAILY = new BN(2_000_000); // 2.00 devUSDC daily cap
const TOP_UP_LAMPORTS = 1_000_000; // 1.00 devUSDC vault top-up target

function solscanUrl(sig: string, cluster: string): string {
  if (cluster === "mainnet-beta") return `https://solscan.io/tx/${sig}`;
  return `https://solscan.io/tx/${sig}?cluster=${cluster}`;
}

async function main() {
  const cfg = loadConfig();
  const conn = new Connection(cfg.rpcUrl, "confirmed");

  const owner = loadOrCreateKeypair("demo-owner.json");
  const agent = loadOrCreateKeypair("demo-agent.json");
  const mint = new PublicKey(cfg.mint);

  console.log(`[agent] cluster      : ${cfg.cluster}`);
  console.log(`[agent] owner        : ${owner.publicKey.toBase58()}`);
  console.log(`[agent] agent signer : ${agent.publicKey.toBase58()}`);

  // Both the owner and the agent signer need SOL for tx fees.
  await ensureFunded(conn, owner.publicKey);
  await ensureFunded(conn, agent.publicKey);

  // We sign owner txs with the owner key, agent txs with the agent key.
  const ownerProvider = new AnchorProvider(conn, new Wallet(owner), {
    commitment: "confirmed",
  });
  const agentProvider = new AnchorProvider(conn, new Wallet(agent), {
    commitment: "confirmed",
  });

  const ownerCortex = new CortexClient(ownerProvider, {
    programId: new PublicKey(cfg.programId),
  });
  const agentCortex = new CortexClient(agentProvider, {
    programId: new PublicKey(cfg.programId),
  });

  const [agentWalletPda] = ownerCortex.agentWalletPda(agent.publicKey);
  const agentVault = ownerCortex.agentVault(agentWalletPda, mint);

  // Step 1: Create agent wallet (idempotent).
  const existingWallet =
    await ownerCortex.fetchAgentWalletByPda(agentWalletPda);
  if (!existingWallet) {
    console.log(`[agent] creating wallet ${agentWalletPda.toBase58()}`);
    const sig = await ownerCortex
      .createAgentWallet({
        ownerPubkey: owner.publicKey,
        agentPubkey: agent.publicKey,
        mint,
        perCallLimit: PER_CALL,
        dailyLimit: DAILY,
      })
      .rpc();
    console.log(`[agent]   ${solscanUrl(sig, cfg.cluster)}`);
  } else {
    console.log(`[agent] wallet ready ${agentWalletPda.toBase58()}`);
  }

  // Step 2: Top-up vault if low.
  const ownerAta = await getOrCreateAssociatedTokenAccount(
    conn,
    owner,
    mint,
    owner.publicKey
  );
  const vaultBefore = await safeBalance(conn, agentVault);
  if (vaultBefore < TOP_UP_LAMPORTS) {
    const need = BigInt(TOP_UP_LAMPORTS) - vaultBefore;
    console.log(`[agent] topping up vault by ${Number(need) / 1e6} devUSDC`);
    const tx = new Transaction().add(
      createTransferCheckedInstruction(
        ownerAta.address,
        mint,
        agentVault,
        owner.publicKey,
        need,
        6
      )
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [owner]);
    console.log(`[agent]   ${solscanUrl(sig, cfg.cluster)}`);
  }

  // Step 3: Call each skill once.
  console.log(`[agent] available skills:`);
  for (const s of cfg.skills) {
    console.log(
      `  - ${s.slug.padEnd(24)} ${(s.pricePerCall / 1e6).toFixed(2)} devUSDC`
    );
  }

  for (const skillCfg of cfg.skills) {
    const skill = await agentCortex.fetchSkill(skillCfg.slug);
    if (!skill) {
      console.warn(`[agent] skill ${skillCfg.slug} disappeared, skipping`);
      continue;
    }

    const authorAta = getAssociatedTokenAddressSync(skill.mint, skill.author);

    console.log("");
    console.log(
      `[agent] >> calling ${skill.slug} @ ${(skill.pricePerCall.toNumber() / 1e6).toFixed(3)} devUSDC`
    );
    const sig = await agentCortex
      .payForCall({
        agentPubkey: agent.publicKey,
        agentVault,
        skill: skill.publicKey,
        authorTokenAccount: authorAta,
      })
      .rpc();
    console.log(`[agent]    settled  ${solscanUrl(sig, cfg.cluster)}`);
    console.log(`[agent]    response  → "${mockResponse(skill.slug)}"`);
  }

  // Step 4: Final state.
  const finalWallet = await ownerCortex.fetchAgentWalletByPda(agentWalletPda);
  const vaultAfter = await safeBalance(conn, agentVault);
  console.log("");
  console.log("[agent] === run summary ===");
  console.log(
    `[agent] total calls (lifetime): ${finalWallet?.totalCalls.toString() ?? "?"}`
  );
  console.log(
    `[agent] total spent (lifetime): ${
      finalWallet?.totalSpent.toString() ?? "?"
    } (${(finalWallet?.totalSpent.toNumber() ?? 0) / 1e6} devUSDC)`
  );
  console.log(
    `[agent] daily spent           : ${
      finalWallet?.dailySpent.toString() ?? "?"
    } / ${finalWallet?.dailyLimit.toString() ?? "?"} (${
      (finalWallet?.dailyLimit.toNumber() ?? 0) / 1e6
    } devUSDC daily cap)`
  );
  console.log(
    `[agent] vault balance          : ${Number(vaultAfter) / 1e6} devUSDC`
  );
}

function mockResponse(slug: string): string {
  switch (slug) {
    case "demo-weather":
      return "Aktobe, KZ — 14 °C, partly cloudy";
    case "demo-web-search":
      return "5 hits for 'YC RFS AI-Native Service Companies'";
    case "colosseum-research":
      return "8-step research output for 'agentic stablecoin payments'";
    default:
      return "ok";
  }
}

async function safeBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  try {
    const account = await getAccount(conn, ata);
    return account.amount;
  } catch {
    return 0n;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
