/**
 * Seed Cortex demo state.
 *
 * Idempotent: creates a devUSDC-like mint, registers three demo skills
 * (weather, web-search, colosseum-research) and writes everything to
 * `config/demo.json` so the demo agent + frontend can find them.
 *
 * By default points at devnet. Override with CORTEX_RPC_URL.
 */
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { CortexClient } from "../sdk/src";
import { loadOrCreateKeypair, saveConfig, ensureFunded } from "./lib/keys";

const SKILLS = [
  {
    slug: "demo-weather",
    name: "Weather",
    description: "Returns current weather for a city.",
    manifestUri: "https://example.com/skills/weather.json",
    pricePerCall: 50_000, // 0.05 devUSDC
  },
  {
    slug: "demo-web-search",
    name: "Web Search",
    description: "Searches the web and returns top 5 results.",
    manifestUri: "https://example.com/skills/web-search.json",
    pricePerCall: 100_000, // 0.1 devUSDC
  },
  {
    slug: "colosseum-research",
    name: "Colosseum Research",
    description:
      "Runs the 8-step Colosseum research workflow on a Solana topic.",
    manifestUri: "https://arena.colosseum.org/copilot",
    pricePerCall: 200_000, // 0.2 devUSDC
  },
];

async function main() {
  const rpcUrl = process.env.CORTEX_RPC_URL ?? clusterApiUrl("devnet");
  const conn = new Connection(rpcUrl, "confirmed");

  console.log(`[seed] cluster: ${rpcUrl}`);

  const owner = loadOrCreateKeypair("demo-owner.json");
  const agent = loadOrCreateKeypair("demo-agent.json");
  const author = loadOrCreateKeypair("demo-author.json");

  console.log(`[seed] owner   : ${owner.publicKey.toBase58()}`);
  console.log(`[seed] agent   : ${agent.publicKey.toBase58()}`);
  console.log(`[seed] author  : ${author.publicKey.toBase58()}`);

  for (const kp of [owner, author]) {
    await ensureFunded(conn, kp.publicKey);
  }

  const provider = new AnchorProvider(conn, new Wallet(owner), {
    commitment: "confirmed",
  });
  const cortex = new CortexClient(provider);

  // 1. Create devUSDC mint (or load existing).
  let mint: PublicKey;
  if (process.env.CORTEX_MINT) {
    mint = new PublicKey(process.env.CORTEX_MINT);
    console.log(`[seed] reusing mint ${mint.toBase58()}`);
  } else {
    mint = await createMint(conn, owner, owner.publicKey, null, 6);
    console.log(`[seed] created mint ${mint.toBase58()}`);
  }

  // 2. Author ATA + mint a balance so they can receive payments
  //    (needed for ATA to exist as a target of pay_for_call).
  const authorAta = await getOrCreateAssociatedTokenAccount(
    conn,
    owner,
    mint,
    author.publicKey
  );
  await mintTo(
    conn,
    owner,
    mint,
    authorAta.address,
    owner,
    1 // dust so the ATA is initialised; revenue accrues from agent calls
  );

  // 3. Register skills (idempotent).
  for (const skill of SKILLS) {
    const existing = await cortex.fetchSkill(skill.slug);
    if (existing) {
      console.log(`[seed] skill ${skill.slug} already registered`);
      continue;
    }
    const sig = await cortex
      .registerSkill({
        authorPubkey: author.publicKey,
        mint,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        manifestUri: skill.manifestUri,
        pricePerCall: new BN(skill.pricePerCall),
      })
      .signers([author])
      .rpc();
    console.log(
      `[seed] registered ${skill.slug} (${skill.pricePerCall / 1e6} devUSDC) tx=${sig}`
    );
  }

  const skills = await Promise.all(
    SKILLS.map(async (s) => {
      const fetched = await cortex.fetchSkill(s.slug);
      if (!fetched) throw new Error(`registration failed for ${s.slug}`);
      return {
        slug: fetched.slug,
        pda: fetched.publicKey.toBase58(),
        pricePerCall: fetched.pricePerCall.toNumber(),
        author: fetched.author.toBase58(),
      };
    })
  );

  saveConfig({
    cluster: rpcUrl.includes("devnet")
      ? "devnet"
      : rpcUrl.includes("mainnet")
        ? "mainnet-beta"
        : "localnet",
    rpcUrl,
    programId: cortex.programId.toBase58(),
    mint: mint.toBase58(),
    ownerPubkey: owner.publicKey.toBase58(),
    agentPubkey: agent.publicKey.toBase58(),
    authors: { default: author.publicKey.toBase58() },
    skills,
  });

  console.log(`[seed] wrote config/demo.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
