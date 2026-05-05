"use client";

/**
 * Solana wallet + connection providers for the Cortex dashboard.
 *
 * Wraps the app in `@solana/wallet-adapter-react` so any client component
 * can use `useWallet()`, `useAnchorWallet()` and `useConnection()` to
 * sign transactions through the connected browser wallet (Phantom,
 * Solflare, Backpack, etc.).
 */
import { useMemo, type PropsWithChildren } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

const RPC_URL =
  process.env.NEXT_PUBLIC_CORTEX_RPC_URL ?? clusterApiUrl("devnet");

const NETWORK: WalletAdapterNetwork =
  process.env.NEXT_PUBLIC_CORTEX_CLUSTER === "mainnet-beta"
    ? WalletAdapterNetwork.Mainnet
    : process.env.NEXT_PUBLIC_CORTEX_CLUSTER === "testnet"
      ? WalletAdapterNetwork.Testnet
      : WalletAdapterNetwork.Devnet;

export function Providers({ children }: PropsWithChildren) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: NETWORK }),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
