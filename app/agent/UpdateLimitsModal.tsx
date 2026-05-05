"use client";

import { useState } from "react";
import { PublicKey, TransactionSignature } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
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

export function UpdateLimitsModal({
  owner,
  ownerPubkey,
  wallet,
  onClose,
  onSettled,
}: {
  owner: AnchorWallet;
  ownerPubkey: PublicKey;
  wallet: AgentWalletState;
  onClose: () => void;
  onSettled: (signature: TransactionSignature) => void;
}) {
  const { connection } = useConnection();
  const [perCall, setPerCall] = useState(
    formatToken(wallet.perCallLimit.toString())
  );
  const [daily, setDaily] = useState(formatToken(wallet.dailyLimit.toString()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const client = buildOwnerClient(connection, owner);
      const sig = await client
        .updateAgentLimits(
          ownerPubkey,
          wallet.publicKey,
          toMicro(perCall),
          toMicro(daily)
        )
        .rpc();
      onSettled(sig);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Update spending limits" onClose={onClose}>
      <p className="text-sm text-zinc-400">
        Both limits take effect at the next call. Daily counter does not reset —
        it just gets compared against the new ceiling.
      </p>

      <NumberInput
        label="Per-call limit (USDC)"
        value={perCall}
        onChange={setPerCall}
        hint={`Currently ${formatToken(wallet.perCallLimit.toString())} USDC`}
      />
      <NumberInput
        label="Daily limit (USDC)"
        value={daily}
        onChange={setDaily}
        hint={`Currently ${formatToken(wallet.dailyLimit.toString())} USDC`}
      />

      {error && <FormError text={error} />}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost" disabled={busy}>
          Cancel
        </button>
        <button onClick={submit} className="btn-pill" disabled={busy}>
          {busy ? "Submitting…" : "Update limits"}
          <span aria-hidden>→</span>
        </button>
      </div>
    </Modal>
  );
}
