"use client";

import { useState } from "react";
import { PublicKey, TransactionSignature } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Modal, FormError, NumberInput } from "./Modal";
import { buildOwnerClient } from "../lib/wallet-cortex";
import { loadOrCreateAgentKeypair } from "../lib/agent-keypair";
import { shortAddr } from "../lib/cortex";

const DECIMALS = 6;

function toMicro(usdc: string): BN {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return new BN(Math.round(n * 10 ** DECIMALS));
}

export function CreateWalletModal({
  owner,
  ownerPubkey,
  mint,
  onClose,
  onSettled,
}: {
  owner: AnchorWallet;
  ownerPubkey: PublicKey;
  mint: PublicKey;
  onClose: () => void;
  onSettled: (signature: TransactionSignature) => void;
}) {
  const { connection } = useConnection();
  const [perCall, setPerCall] = useState("0.30");
  const [daily, setDaily] = useState("2.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agent = loadOrCreateAgentKeypair(ownerPubkey.toBase58());

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const client = buildOwnerClient(connection, owner);
      const sig = await client
        .createAgentWallet({
          ownerPubkey,
          agentPubkey: agent.publicKey,
          mint,
          perCallLimit: toMicro(perCall),
          dailyLimit: toMicro(daily),
        })
        .rpc();
      onSettled(sig);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Create agent wallet" onClose={onClose}>
      <p className="text-sm text-zinc-400">
        A fresh AgentWallet PDA owned by your wallet is created on-chain. Cortex
        generates a separate signing keypair for the agent itself (stored in
        this browser, not on-chain) and writes its pubkey into the PDA.
      </p>

      <div className="space-y-1 rounded-md border border-white/5 bg-black/30 p-3">
        <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
          Agent signer (auto-generated)
        </p>
        <p className="font-mono text-xs text-zinc-200">
          {shortAddr(agent.publicKey.toBase58(), 8)}
        </p>
        <p className="font-mono text-[10px] text-zinc-500">
          Stored locally — kept low-privilege by per-call + daily caps below.
        </p>
      </div>

      <NumberInput
        label="Per-call limit (USDC)"
        value={perCall}
        onChange={setPerCall}
        hint="Hard ceiling on the price of any single skill call."
      />
      <NumberInput
        label="Daily limit (USDC)"
        value={daily}
        onChange={setDaily}
        hint="Rolling 24h spending cap. Enforced on-chain."
      />

      {error && <FormError text={error} />}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost" disabled={busy}>
          Cancel
        </button>
        <button onClick={submit} className="btn-pill" disabled={busy}>
          {busy ? "Submitting…" : "Create wallet"}
          <span aria-hidden>→</span>
        </button>
      </div>
    </Modal>
  );
}
