"use client";

import { useState } from "react";
import { PublicKey, Transaction, TransactionSignature } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { Modal, FormError, NumberInput } from "./Modal";
import type { AgentWalletState } from "../../sdk/src/types";
import { formatToken } from "../lib/cortex";

const DECIMALS = 6;

function toMicro(usdc: string): bigint {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return BigInt(Math.round(n * 10 ** DECIMALS));
}

export function DepositModal({
  owner,
  ownerPubkey,
  wallet,
  ownerBalance,
  onClose,
  onSettled,
}: {
  owner: AnchorWallet;
  ownerPubkey: PublicKey;
  wallet: AgentWalletState;
  ownerBalance: bigint;
  onClose: () => void;
  onSettled: (signature: TransactionSignature) => void;
}) {
  const { connection } = useConnection();
  const [amount, setAmount] = useState("1.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const lamports = toMicro(amount);
      if (lamports > ownerBalance) {
        throw new Error(
          `Insufficient balance: have ${formatToken(ownerBalance.toString())} USDC`
        );
      }

      const ownerAta = getAssociatedTokenAddressSync(wallet.mint, ownerPubkey);
      const vault = getAssociatedTokenAddressSync(
        wallet.mint,
        wallet.publicKey,
        true
      );

      const tx = new Transaction();

      // Make sure the vault ATA exists (it should, but be safe).
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          ownerPubkey,
          vault,
          wallet.publicKey,
          wallet.mint
        )
      );
      tx.add(
        createTransferCheckedInstruction(
          ownerAta,
          wallet.mint,
          vault,
          ownerPubkey,
          new BN(lamports.toString()).toNumber(),
          DECIMALS
        )
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = ownerPubkey;
      const signed = await owner.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      onSettled(sig);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Deposit USDC" onClose={onClose}>
      <p className="text-sm text-zinc-400">
        Top up the agent vault from your wallet&apos;s USDC ATA. This is a plain
        SPL transfer — the program doesn&apos;t need to sign for incoming
        deposits.
      </p>

      <div className="grid grid-cols-2 gap-3 rounded-md border border-white/5 bg-black/30 p-3">
        <div>
          <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
            You hold
          </p>
          <p className="font-mono text-sm text-zinc-200">
            {formatToken(ownerBalance.toString())} USDC
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
            Vault target
          </p>
          <p className="font-mono text-xs text-zinc-200">
            {wallet.publicKey.toBase58().slice(0, 8)}…
            {wallet.publicKey.toBase58().slice(-6)}
          </p>
        </div>
      </div>

      <NumberInput label="Amount (USDC)" value={amount} onChange={setAmount} />

      {error && <FormError text={error} />}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost" disabled={busy}>
          Cancel
        </button>
        <button onClick={submit} className="btn-pill" disabled={busy}>
          {busy ? "Submitting…" : "Deposit"}
          <span aria-hidden>→</span>
        </button>
      </div>
    </Modal>
  );
}
