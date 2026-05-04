import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Anchor + @solana/web3.js misbehave under Turbopack's CJS-ESM bundler
  // (`web3_js_1.PublicKey is not a constructor`). Run them as Node externals
  // on the server — the dashboard only reads on-chain state from RPC anyway.
  serverExternalPackages: [
    "ws",
    "@solana/web3.js",
    "@coral-xyz/anchor",
    "@solana/spl-token",
    "bs58",
    "bn.js",
  ],
};

export default nextConfig;
