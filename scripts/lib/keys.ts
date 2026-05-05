import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

export const ROOT = resolve(__dirname, "../..");
export const CONFIG_DIR = resolve(ROOT, "config");
export const DEMO_CONFIG_PATH = resolve(CONFIG_DIR, "demo.json");

export type DemoConfig = {
  cluster: string;
  rpcUrl: string;
  programId: string;
  mint: string;
  ownerPubkey: string;
  agentPubkey: string;
  authors: Record<string, string>;
  skills: { slug: string; pda: string; pricePerCall: number; author: string }[];
};

export function loadOrCreateKeypair(file: string): Keypair {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const path = resolve(CONFIG_DIR, file);
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export function loadConfig(): DemoConfig {
  if (!existsSync(DEMO_CONFIG_PATH)) {
    throw new Error(
      `${DEMO_CONFIG_PATH} not found — run \`npm run demo:seed\` first.`
    );
  }
  return JSON.parse(readFileSync(DEMO_CONFIG_PATH, "utf8")) as DemoConfig;
}

export function saveConfig(config: DemoConfig) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(DEMO_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function ensureFunded(
  conn: Connection,
  pubkey: PublicKey,
  minLamports: number = LAMPORTS_PER_SOL / 10 // 0.1 SOL is plenty for tx fees
): Promise<void> {
  const balance = await conn.getBalance(pubkey);
  if (balance >= minLamports) return;

  const need = Math.max(minLamports - balance, LAMPORTS_PER_SOL / 10);
  try {
    const sig = await conn.requestAirdrop(pubkey, need);
    await conn.confirmTransaction(sig, "confirmed");
  } catch (err) {
    console.warn(
      `[keys] airdrop failed for ${pubkey.toBase58()} — fund manually with:`
    );
    console.warn(
      `  solana transfer ${pubkey.toBase58()} 0.5 -u ${conn.rpcEndpoint} --allow-unfunded-recipient`
    );
    throw err;
  }
}
