#!/usr/bin/env -S ts-node --project ../scripts/tsconfig.json
/**
 * cortex — publish, update, and verify skills against the Cortex
 * Solana program from a `cortex.toml` next to your skill's source.
 *
 * Usage:
 *
 *   cortex publish [path]            # register or update from cortex.toml
 *   cortex inspect <slug>            # show on-chain state of a skill
 *   cortex deactivate <slug>         # mark active=false (author-signed)
 *   cortex close <slug>              # close skill PDA + refund rent
 *
 * `cortex.toml` (next to your skill's HTTP handler):
 *
 *   slug         = "tavily-search"
 *   name         = "Tavily Search"
 *   description  = "AI-grade web search via Tavily."
 *   manifest_uri = "https://my-skill.example.com/api/search"
 *   price_usdc   = "0.05"
 *   author       = "9e7Gbz...VoH2"          # MUST match keypair below
 *   keypair      = "~/.config/solana/id.json" # OR --keypair flag
 *   network      = "devnet"                 # or "mainnet-beta"
 *
 *   # Optional: a public link to the canonical cortex.toml in version
 *   # control. The CLI fetches and diffs it before publishing so the
 *   # author has a paper trail of "this slug ↔ this repo".
 *   verify_url   = "https://raw.githubusercontent.com/<org>/<repo>/main/cortex.toml"
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { Cortex } from "../../sdk/src";

type CortexToml = {
  slug: string;
  name: string;
  description: string;
  manifest_uri: string;
  price_usdc: string;
  author: string;
  keypair?: string;
  network?: "devnet" | "mainnet-beta" | "localnet";
  mint?: string;
  verify_url?: string;
};

const KNOWN_MINTS: Record<string, string> = {
  // devUSDC seeded by `npm run demo:seed` on devnet.
  devnet: "9QtDZ1ojHg8UtUtcxjzZ2Xb24Z8vRJ3vEiVgBSAskpn5",
  // Circle USDC on mainnet.
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

function parseTomlSubset(text: string): CortexToml {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!m) continue;
    const [, key] = m;
    let val = m[2];
    val = val.trim();
    if (val.endsWith(",")) val = val.slice(0, -1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  for (const k of [
    "slug",
    "name",
    "description",
    "manifest_uri",
    "price_usdc",
    "author",
  ]) {
    if (!out[k]) throw new Error(`cortex.toml missing required field "${k}"`);
  }
  return out as unknown as CortexToml;
}

function expandHome(path: string): string {
  if (path.startsWith("~")) return resolve(homedir() + path.slice(1));
  return resolve(path);
}

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(expandHome(path), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function rpcUrlFor(network: CortexToml["network"]): string {
  switch (network) {
    case "mainnet-beta":
      return process.env.CORTEX_RPC_URL ?? clusterApiUrl("mainnet-beta");
    case "localnet":
      return "http://127.0.0.1:8899";
    default:
      return process.env.CORTEX_RPC_URL ?? clusterApiUrl("devnet");
  }
}

function usdcMicros(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`price_usdc "${amount}" is not a positive number`);
  }
  return Math.round(n * 1e6);
}

async function maybeFetchVerifyUrl(verifyUrl: string): Promise<string | null> {
  try {
    const r = await fetch(verifyUrl);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function diffToml(local: string, remote: string): string[] {
  const norm = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .sort();
  const a = new Set(norm(local));
  const b = new Set(norm(remote));
  const diff: string[] = [];
  for (const line of a) if (!b.has(line)) diff.push(`local-only: ${line}`);
  for (const line of b) if (!a.has(line)) diff.push(`remote-only: ${line}`);
  return diff;
}

async function cmdPublish(tomlPath: string) {
  const text = readFileSync(tomlPath, "utf8");
  const cfg = parseTomlSubset(text);

  // Verify off-chain "this slug ↔ this repo" claim if author provided one.
  if (cfg.verify_url) {
    console.log(`[cortex] fetching ${cfg.verify_url} to verify cortex.toml`);
    const remote = await maybeFetchVerifyUrl(cfg.verify_url);
    if (!remote) {
      console.warn(
        `[cortex]   ⚠ could not fetch verify_url — publishing anyway`
      );
    } else {
      const diff = diffToml(text, remote);
      if (diff.length === 0) {
        console.log(`[cortex]   ✓ local cortex.toml matches remote`);
      } else {
        console.warn(
          `[cortex]   ⚠ local cortex.toml differs from remote (publishing local):`
        );
        for (const d of diff.slice(0, 10)) console.warn(`     ${d}`);
      }
    }
  }

  const network = cfg.network ?? "devnet";
  const rpcUrl = rpcUrlFor(network);
  const conn = new Connection(rpcUrl, "confirmed");

  const keypairPath =
    cfg.keypair ??
    process.env.ANCHOR_WALLET ??
    `${homedir()}/.config/solana/id.json`;
  const author = loadKeypair(keypairPath);

  // Sanity: the configured author must match the keypair we'll sign with.
  if (author.publicKey.toBase58() !== cfg.author) {
    throw new Error(
      `cortex.toml author=${cfg.author} but keypair pubkey=${author.publicKey.toBase58()}`
    );
  }

  // The Cortex SDK class still expects an `agent` keypair so it can
  // fetch state through a single Anchor program client; the publish
  // CLI never signs `pay_for_call`, so we pass a throwaway Keypair.
  const cortex = new Cortex({
    rpcUrl,
    agent: Keypair.generate(),
    author,
    programId: process.env.CORTEX_PROGRAM_ID,
  });

  const mintAddr =
    cfg.mint ?? process.env.CORTEX_MINT ?? KNOWN_MINTS[network] ?? "";
  if (!mintAddr) {
    throw new Error(
      `Cannot resolve mint for network=${network}. Set "mint" in cortex.toml or CORTEX_MINT.`
    );
  }
  const mint = new PublicKey(mintAddr);

  const price = usdcMicros(cfg.price_usdc);
  const existing = await cortex.getSkill(cfg.slug);

  if (existing) {
    console.log(
      `[cortex] skill ${cfg.slug} already exists @ ${existing.publicKey.toBase58()}`
    );
    if (!existing.author.equals(author.publicKey)) {
      throw new Error(
        `Existing skill is owned by ${existing.author.toBase58()} — refusing to update.`
      );
    }
    if (existing.pricePerCall.toNumber() !== price) {
      console.log(
        `[cortex]   updating price ${existing.pricePerCall.toString()} -> ${price}`
      );
      const sig = await cortex.updateSkill(cfg.slug, { newPrice: price });
      console.log(`[cortex]   tx ${sig}`);
    }
    if (!existing.active) {
      console.log(`[cortex]   re-activating skill`);
      const sig = await cortex.updateSkill(cfg.slug, { active: true });
      console.log(`[cortex]   tx ${sig}`);
    }
    console.log(`[cortex] done.`);
    return;
  }

  console.log(
    `[cortex] registering ${cfg.slug} @ ${cfg.price_usdc} USDC on ${network}…`
  );
  const sig = await cortex.registerSkill({
    slug: cfg.slug,
    name: cfg.name,
    description: cfg.description,
    manifestUri: cfg.manifest_uri,
    pricePerCall: price,
    mint,
  });
  console.log(`[cortex]   ✓ registered`);
  console.log(`[cortex]   tx ${sig}`);
  console.log(`[cortex]   https://solscan.io/tx/${sig}?cluster=${network}`);
  void conn;
}

async function cmdInspect(slug: string) {
  const rpcUrl = process.env.CORTEX_RPC_URL ?? clusterApiUrl("devnet");
  const cortex = new Cortex({ rpcUrl, agent: Keypair.generate() });
  const skill = await cortex.getSkill(slug);
  if (!skill) {
    console.log(`Skill ${slug} not found.`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    publicKey: skill.publicKey.toBase58(),
    author: skill.author.toBase58(),
    mint: skill.mint.toBase58(),
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    manifestUri: skill.manifestUri,
    pricePerCall: skill.pricePerCall.toString(),
    totalCalls: skill.totalCalls.toString(),
    totalRevenue: skill.totalRevenue.toString(),
    active: skill.active,
  }, null, 2));
}

async function authorCortexFromCwd(): Promise<Cortex> {
  const tomlPath = resolve("cortex.toml");
  if (!existsSync(tomlPath)) {
    throw new Error(`No cortex.toml in ${process.cwd()}`);
  }
  const cfg = parseTomlSubset(readFileSync(tomlPath, "utf8"));
  const rpcUrl = rpcUrlFor(cfg.network ?? "devnet");
  const author = loadKeypair(
    cfg.keypair ??
      process.env.ANCHOR_WALLET ??
      `${homedir()}/.config/solana/id.json`
  );
  return new Cortex({
    rpcUrl,
    agent: Keypair.generate(),
    author,
    programId: process.env.CORTEX_PROGRAM_ID,
  });
}

async function cmdDeactivate(slug: string) {
  const cortex = await authorCortexFromCwd();
  const sig = await cortex.updateSkill(slug, { active: false });
  console.log(`[cortex] ${slug} → active=false  tx=${sig}`);
}

async function cmdClose(slug: string) {
  const cortex = await authorCortexFromCwd();
  const sig = await cortex.closeSkill(slug);
  console.log(`[cortex] ${slug} closed; rent refunded.  tx=${sig}`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "publish": {
      const path = resolve(rest[0] ?? "cortex.toml");
      if (!existsSync(path)) {
        console.error(`No cortex.toml found at ${path}`);
        process.exit(1);
      }
      await cmdPublish(path);
      return;
    }
    case "inspect":
      if (!rest[0]) throw new Error("usage: cortex inspect <slug>");
      await cmdInspect(rest[0]);
      return;
    case "deactivate":
      if (!rest[0]) throw new Error("usage: cortex deactivate <slug>");
      await cmdDeactivate(rest[0]);
      return;
    case "close":
      if (!rest[0]) throw new Error("usage: cortex close <slug>");
      await cmdClose(rest[0]);
      return;
    default:
      console.log(
        [
          "cortex — Solana-native infrastructure for AI agents",
          "",
          "Commands:",
          "  cortex publish [path]    Register or update a skill from cortex.toml",
          "  cortex inspect <slug>    Print on-chain state of a skill",
          "  cortex deactivate <slug> Mark a skill inactive (author-signed)",
          "  cortex close <slug>      Close skill PDA + refund rent (author-signed)",
          "",
          "Env vars:",
          "  CORTEX_RPC_URL           Override the RPC endpoint",
          "  CORTEX_PROGRAM_ID        Override the on-chain program ID",
          "  CORTEX_MINT              Override the SPL mint",
          "  ANCHOR_WALLET            Path to keypair (default ~/.config/solana/id.json)",
        ].join("\n")
      );
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
