"use client";

import { useState } from "react";
import { PublicKey, TransactionSignature } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Modal, FormError, NumberInput } from "./Modal";
import { buildOwnerClient } from "../lib/wallet-cortex";
import type { AgentWalletState } from "../../sdk/src/types";
import { formatToken } from "../lib/cortex";

const DECIMALS = 6;

function toMicro(usdc: string): BN {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return new BN(Math.round(n * 10 ** DECIMALS));
}

export function WithdrawModal({
  owner,
  ownerPubkey,
  wallet,
  vaultBalance,
  onClose,
  onSettled,
}: {
  owner: AnchorWallet;
  ownerPubkey: PublicKey;
  wallet: AgentWalletState;
  vaultBalance: bigint;
  onClose: () => void;
  onSettled: (signature: TransactionSignature) => void;
}) {
  const { connection } = useConnection();
  const [amount, setAmount] = useState(formatToken(vaultBalance.toString()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const amountBn = toMicro(amount);
      if (BigInt(amountBn.toString()) > vaultBalance) {
        throw new Error(
          `Vault has only ${formatToken(vaultBalance.toString())} USDC`
        );
      }
      const ownerAta = getAssociatedTokenAddressSync(wallet.mint, ownerPubkey);
      const vault = getAssociatedTokenAddressSync(
        wallet.mint,
        wallet.publicKey,
        true
      );
      const client = buildOwnerClient(connection, owner);
      const sig = await client
        .withdraw(ownerPubkey, wallet.publicKey, vault, ownerAta, amountBn)
        .rpc();
      onSettled(sig);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Withdraw from vault" onClose={onClose}>
      <p className="text-sm text-zinc-400">
        Pull USDC out of the agent vault back to your owner wallet. Owner
        signature required — the program rejects withdrawals from any other key.
      </p>

      <div className="rounded-md border border-white/5 bg-black/30 p-3">
        <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
          Vault balance
        </p>
        <p className="font-mono text-sm text-zinc-200">
          {formatToken(vaultBalance.toString())} USDC
        </p>
      </div>

      <NumberInput label="Amount (USDC)" value={amount} onChange={setAmount} />

      {error && <FormError text={error} />}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost" disabled={busy}>
          Cancel
        </button>
        <button onClick={submit} className="btn-pill" disabled={busy}>
          {busy ? "Submitting…" : "Withdraw"}
          <span aria-hidden>→</span>
        </button>
      </div>
    </Modal>
  );
}
