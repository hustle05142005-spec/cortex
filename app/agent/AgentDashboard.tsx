"use client";

/**
 * Connected-wallet agent dashboard.
 *
 * Behaviour, in order of precedence:
 *
 *   1. If a wallet is connected: this owner's view. Either we find an
 *      AgentWallet PDA (load → manage), or we show "Create your agent
 *      wallet" CTA.
 *
 *   2. If not connected: show the read-only demo agent (for visitors
 *      who want to see what the dashboard looks like with on-chain data
 *      but don't want to install a wallet). The demo agent pubkey
 *      comes from `NEXT_PUBLIC_DEMO_AGENT_PUBKEY`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  useConnection,
  useWallet,
  useAnchorWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CortexClient } from "../../sdk/src";
import type { AgentWalletState } from "../../sdk/src/types";
import {
  CORTEX_CLUSTER,
  CORTEX_PROGRAM_ID,
  DEMO_AGENT_PUBKEY,
  formatToken,
  shortAddr,
  solscanAddrUrl,
} from "../lib/cortex";
import { loadOrCreateAgentKeypair } from "../lib/agent-keypair";
import { CreateWalletModal } from "./CreateWalletModal";
import { DepositModal } from "./DepositModal";
import { WithdrawModal } from "./WithdrawModal";
import { UpdateLimitsModal } from "./UpdateLimitsModal";
import { TxHistory } from "./TxHistory";

const DEFAULT_MINT =
  process.env.NEXT_PUBLIC_CORTEX_MINT ??
  "9QtDZ1ojHg8UtUtcxjzZ2Xb24Z8vRJ3vEiVgBSAskpn5";

type View =
  | { kind: "loading" }
  | { kind: "no-wallet"; demo?: AgentWalletState | null }
  | { kind: "no-pda"; ownerPubkey: PublicKey }
  | { kind: "ready"; ownerPubkey: PublicKey; wallet: AgentWalletState };

type ToastKind = "info" | "success" | "error";
type Toast = { kind: ToastKind; text: string };

export function AgentDashboard() {
  const { connection } = useConnection();
  const { publicKey: ownerPubkey } = useWallet();
  const wallet = useAnchorWallet();

  const [view, setView] = useState<View>({ kind: "loading" });
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [ownerBalance, setOwnerBalance] = useState<bigint>(0n);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [openModal, setOpenModal] = useState<
    "create" | "deposit" | "withdraw" | "limits" | null
  >(null);

  // Cancel the previous timer when a new toast comes in so toast B
  // doesn't get dismissed early because toast A's 6-second timer is
  // still running.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((kind: ToastKind, text: string) => {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6_000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Read-only client to fetch state. AnchorProvider needs a wallet
  // shape; use the connected one if any, else a stub keypair-backed
  // wallet that never gets asked to sign anything (we only call .fetch
  // on `account.*` from this client).
  const readOnlyClient = useMemo(() => {
    const stub = wallet ?? {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async <
        T extends Transaction | VersionedTransaction,
      >(): Promise<T> => {
        throw new Error("read-only client cannot sign");
      },
      signAllTransactions: async <
        T extends Transaction | VersionedTransaction,
      >(): Promise<T[]> => {
        throw new Error("read-only client cannot sign");
      },
    };
    const provider = new AnchorProvider(connection, stub, {
      commitment: "confirmed",
    });
    return new CortexClient(provider, {
      programId: new PublicKey(CORTEX_PROGRAM_ID),
    });
  }, [connection, wallet]);

  // Load wallet state whenever owner connects or refresh ticks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ownerPubkey) {
        // Fall back to demo agent for unconnected visitors.
        if (DEMO_AGENT_PUBKEY) {
          try {
            const demo = await readOnlyClient.fetchAgentWallet(
              new PublicKey(DEMO_AGENT_PUBKEY)
            );
            if (!cancelled) setView({ kind: "no-wallet", demo });
          } catch {
            if (!cancelled) setView({ kind: "no-wallet", demo: null });
          }
        } else {
          setView({ kind: "no-wallet" });
        }
        return;
      }
      const agent = loadOrCreateAgentKeypair(ownerPubkey.toBase58());
      try {
        const w = await readOnlyClient.fetchAgentWallet(agent.publicKey);
        if (cancelled) return;
        if (!w) {
          setView({ kind: "no-pda", ownerPubkey });
        } else {
          setView({ kind: "ready", ownerPubkey, wallet: w });
        }
      } catch (err) {
        console.error("[agent] fetch failed", err);
        if (!cancelled) setView({ kind: "no-pda", ownerPubkey });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerPubkey, readOnlyClient, refreshTick]);

  // Load vault + owner balances when view is ready.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (view.kind !== "ready") return;
      const vault = getAssociatedTokenAddressSync(
        view.wallet.mint,
        view.wallet.publicKey,
        true
      );
      try {
        const acc = await getAccount(connection, vault);
        if (!cancelled) setVaultBalance(acc.amount);
      } catch {
        if (!cancelled) setVaultBalance(0n);
      }
      try {
        const ownerAta = getAssociatedTokenAddressSync(
          view.wallet.mint,
          view.ownerPubkey
        );
        const acc = await getAccount(connection, ownerAta);
        if (!cancelled) setOwnerBalance(acc.amount);
      } catch {
        if (!cancelled) setOwnerBalance(0n);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, connection, refreshTick]);

  // Auto-refresh every 8s while a wallet exists.
  useEffect(() => {
    if (view.kind !== "ready") return;
    const id = window.setInterval(refresh, 8_000);
    return () => window.clearInterval(id);
  }, [view, refresh]);

  const onTxSettled = useCallback(
    (signature: string, label: string) => {
      showToast(
        "success",
        `${label} settled — ${signature.slice(0, 6)}…${signature.slice(-6)}`
      );
      refresh();
    },
    [showToast, refresh]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
            Connected wallet
          </p>
          <p className="mt-1 font-mono text-sm text-zinc-100">
            {ownerPubkey ? (
              <Link
                href={solscanAddrUrl(ownerPubkey.toBase58())}
                target="_blank"
                className="transition-colors hover:text-white"
              >
                {shortAddr(ownerPubkey.toBase58(), 6)} ↗
              </Link>
            ) : (
              <span className="text-zinc-500">— no wallet connected —</span>
            )}
          </p>
        </div>
        <WalletMultiButton />
      </div>

      {view.kind === "loading" && <LoadingCard />}

      {view.kind === "no-wallet" && <NoWalletState demo={view.demo ?? null} />}

      {view.kind === "no-pda" && (
        <>
          <CreateAgentCard
            ownerPubkey={view.ownerPubkey}
            onClick={() => setOpenModal("create")}
          />
          {CORTEX_CLUSTER !== "mainnet-beta" && (
            <FaucetCard
              ownerPubkey={view.ownerPubkey}
              onSettled={(sig) => onTxSettled(sig, "Faucet drip")}
              onError={(msg) => showToast("error", msg)}
            />
          )}
        </>
      )}

      {view.kind === "ready" && (
        <>
          <AgentSnapshotCard
            wallet={view.wallet}
            vaultBalance={vaultBalance}
            ownerBalance={ownerBalance}
            onDeposit={() => setOpenModal("deposit")}
            onWithdraw={() => setOpenModal("withdraw")}
            onUpdate={() => setOpenModal("limits")}
          />
          {CORTEX_CLUSTER !== "mainnet-beta" && ownerBalance < 1_000_000n && (
            <FaucetCard
              ownerPubkey={view.ownerPubkey}
              onSettled={(sig) => onTxSettled(sig, "Faucet drip")}
              onError={(msg) => showToast("error", msg)}
            />
          )}
          <TxHistory pda={view.wallet.publicKey} />
        </>
      )}

      {/* Modals */}
      {wallet && view.kind === "no-pda" && openModal === "create" && (
        <CreateWalletModal
          owner={wallet}
          ownerPubkey={view.ownerPubkey}
          mint={new PublicKey(DEFAULT_MINT)}
          onClose={() => setOpenModal(null)}
          onSettled={(sig) => {
            setOpenModal(null);
            onTxSettled(sig, "Create wallet");
          }}
        />
      )}
      {wallet && view.kind === "ready" && openModal === "deposit" && (
        <DepositModal
          owner={wallet}
          ownerPubkey={view.ownerPubkey}
          wallet={view.wallet}
          ownerBalance={ownerBalance}
          onClose={() => setOpenModal(null)}
          onSettled={(sig) => {
            setOpenModal(null);
            onTxSettled(sig, "Deposit");
          }}
        />
      )}
      {wallet && view.kind === "ready" && openModal === "withdraw" && (
        <WithdrawModal
          owner={wallet}
          ownerPubkey={view.ownerPubkey}
          wallet={view.wallet}
          vaultBalance={vaultBalance}
          onClose={() => setOpenModal(null)}
          onSettled={(sig) => {
            setOpenModal(null);
            onTxSettled(sig, "Withdraw");
          }}
        />
      )}
      {wallet && view.kind === "ready" && openModal === "limits" && (
        <UpdateLimitsModal
          owner={wallet}
          ownerPubkey={view.ownerPubkey}
          wallet={view.wallet}
          onClose={() => setOpenModal(null)}
          onSettled={(sig) => {
            setOpenModal(null);
            onTxSettled(sig, "Update limits");
          }}
        />
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50 max-w-sm">
          <div
            className={`glass-card relative overflow-hidden p-4 ${
              toast.kind === "error"
                ? "border border-red-500/40"
                : toast.kind === "success"
                  ? "border border-emerald-400/40"
                  : ""
            }`}
          >
            <p className="font-mono text-xs text-zinc-100">{toast.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="glass-card relative overflow-hidden p-10 text-center">
      <div className="glass-highlight" />
      <div className="relative z-10">
        <p className="font-mono text-xs tracking-widest uppercase text-zinc-500">
          Loading…
        </p>
      </div>
    </div>
  );
}

function NoWalletState({ demo }: { demo: AgentWalletState | null }) {
  return (
    <div className="space-y-6">
      <div className="glass-card relative overflow-hidden p-10 text-center">
        <div className="glass-highlight" />
        <div className="relative z-10">
          <p className="font-mono text-xs tracking-widest uppercase text-zinc-500">
            Connect a wallet to manage your agent
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
            Connect Phantom or Solflare in {CORTEX_CLUSTER} mode. Your wallet
            becomes the owner key for an AgentWallet PDA. Cortex generates a
            separate operational signer for the agent and stores it locally in
            your browser.
          </p>
        </div>
      </div>

      {demo && (
        <div className="space-y-3">
          <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
            Read-only demo agent
          </p>
          <ReadOnlyDemo wallet={demo} />
        </div>
      )}
    </div>
  );
}

function ReadOnlyDemo({ wallet }: { wallet: AgentWalletState }) {
  const dailyUsedPct =
    wallet.dailyLimit.toNumber() > 0
      ? (wallet.dailySpent.toNumber() / wallet.dailyLimit.toNumber()) * 100
      : 0;

  return (
    <article className="glass-card relative overflow-hidden p-7">
      <div className="glass-highlight" />
      <div className="relative z-10 space-y-7">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
              Wallet PDA
            </p>
            <Link
              href={solscanAddrUrl(wallet.publicKey.toBase58())}
              target="_blank"
              className="mt-1 inline-flex font-mono text-base text-zinc-100 transition-colors hover:text-white"
            >
              {shortAddr(wallet.publicKey.toBase58(), 6)} ↗
            </Link>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-0.5 font-mono text-[10px] tracking-widest uppercase text-emerald-300">
            {CORTEX_CLUSTER}
          </span>
        </header>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
          <Field label="Owner" value={wallet.owner.toBase58()} link />
          <Field label="Agent signer" value={wallet.agent.toBase58()} link />
          <Field
            label="Per-call limit"
            value={`${formatToken(wallet.perCallLimit.toString())} USDC`}
          />
          <Field
            label="Daily limit"
            value={`${formatToken(wallet.dailyLimit.toString())} USDC`}
          />
          <Field label="Lifetime calls" value={wallet.totalCalls.toString()} />
          <Field
            label="Lifetime spent"
            value={`${formatToken(wallet.totalSpent.toString())} USDC`}
          />
        </div>

        <div className="space-y-2 border-t border-white/5 pt-5">
          <div className="flex items-center justify-between font-mono text-[11px] tracking-wider text-zinc-500">
            <span className="uppercase">Daily budget used</span>
            <span>{dailyUsedPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-zinc-200"
              style={{ width: `${Math.min(100, dailyUsedPct)}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function CreateAgentCard({
  ownerPubkey,
  onClick,
}: {
  ownerPubkey: PublicKey;
  onClick: () => void;
}) {
  return (
    <div className="glass-card relative overflow-hidden p-10 text-center">
      <div className="glass-highlight" />
      <div className="relative z-10 space-y-4">
        <p className="font-mono text-xs tracking-widest uppercase text-zinc-500">
          No agent wallet found for {shortAddr(ownerPubkey.toBase58(), 4)}
        </p>
        <p className="mx-auto max-w-md text-sm text-zinc-400">
          Create an AgentWallet PDA owned by your wallet. You set a per-call
          limit and a 24h daily ceiling. The on-chain program enforces both —
          even if the agent key leaks.
        </p>
        <button
          onClick={onClick}
          className="btn-pill btn-pill-lg mt-4 inline-flex"
        >
          Create agent wallet
          <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}

function AgentSnapshotCard({
  wallet,
  vaultBalance,
  ownerBalance,
  onDeposit,
  onWithdraw,
  onUpdate,
}: {
  wallet: AgentWalletState;
  vaultBalance: bigint;
  ownerBalance: bigint;
  onDeposit: () => void;
  onWithdraw: () => void;
  onUpdate: () => void;
}) {
  const dailyUsedPct =
    wallet.dailyLimit.toNumber() > 0
      ? (wallet.dailySpent.toNumber() / wallet.dailyLimit.toNumber()) * 100
      : 0;

  return (
    <article className="glass-card relative overflow-hidden p-7">
      <div className="glass-highlight" />
      <div className="relative z-10 space-y-7">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
              Wallet PDA
            </p>
            <Link
              href={solscanAddrUrl(wallet.publicKey.toBase58())}
              target="_blank"
              className="mt-1 inline-flex font-mono text-base text-zinc-100 transition-colors hover:text-white"
            >
              {shortAddr(wallet.publicKey.toBase58(), 6)} ↗
            </Link>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-0.5 font-mono text-[10px] tracking-widest uppercase text-emerald-300">
            {CORTEX_CLUSTER}
          </span>
        </header>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
          <Field
            label="Vault balance"
            value={`${formatToken(vaultBalance.toString())} USDC`}
            highlight
          />
          <Field label="Agent signer" value={wallet.agent.toBase58()} link />
          <Field label="Mint" value={wallet.mint.toBase58()} link />
          <Field
            label="Per-call limit"
            value={`${formatToken(wallet.perCallLimit.toString())} USDC`}
          />
          <Field
            label="Daily limit"
            value={`${formatToken(wallet.dailyLimit.toString())} USDC`}
          />
          <Field
            label="Daily spent"
            value={`${formatToken(wallet.dailySpent.toString())} USDC`}
          />
        </div>

        <div className="space-y-2 border-t border-white/5 pt-5">
          <div className="flex items-center justify-between font-mono text-[11px] tracking-wider text-zinc-500">
            <span className="uppercase">Daily budget used</span>
            <span>{dailyUsedPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-zinc-200"
              style={{ width: `${Math.min(100, dailyUsedPct)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-5 sm:grid-cols-4">
          <button onClick={onDeposit} className="btn-pill justify-center">
            Deposit
          </button>
          <button onClick={onWithdraw} className="btn-ghost justify-center">
            Withdraw
          </button>
          <button onClick={onUpdate} className="btn-ghost justify-center">
            Update limits
          </button>
          <p className="col-span-2 sm:col-span-1 text-right font-mono text-[10px] text-zinc-500 sm:flex sm:items-center sm:justify-end">
            <span>
              owner balance{" "}
              <span className="text-zinc-300">
                {formatToken(ownerBalance.toString())}
              </span>{" "}
              USDC
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-5 border-t border-white/5 pt-5">
          <Stat
            label="Lifetime calls"
            value={wallet.totalCalls.toString()}
            unit="payments"
          />
          <Stat
            label="Lifetime spent"
            value={formatToken(wallet.totalSpent.toString())}
            unit="USDC"
          />
        </div>
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  link = false,
  highlight = false,
}: {
  label: string;
  value: string;
  link?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
        {label}
      </p>
      {link ? (
        <Link
          href={solscanAddrUrl(value)}
          target="_blank"
          className="mt-1 inline-flex font-mono text-sm text-zinc-100 transition-colors hover:text-white"
        >
          {shortAddr(value, 6)} ↗
        </Link>
      ) : (
        <p
          className={`mt-1 font-mono text-sm ${
            highlight ? "text-emerald-300" : "text-zinc-100"
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-medium tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 font-mono text-[11px] tracking-wider text-zinc-500">
        {unit}
      </p>
    </div>
  );
}

function FaucetCard({
  ownerPubkey,
  onSettled,
  onError,
}: {
  ownerPubkey: PublicKey;
  onSettled: (signature: string) => void;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function drip() {
    setBusy(true);
    try {
      const res = await fetch("/api/faucet/devusdc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerPubkey: ownerPubkey.toBase58(),
          amount: 5,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.signature) {
        onError(json.error ?? `Faucet failed (${res.status})`);
        return;
      }
      onSettled(json.signature);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="glass-card relative overflow-hidden p-5">
      <div className="glass-highlight" />
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
            Need devUSDC?
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Drip 5 devUSDC to your wallet so you can deposit. Devnet only.
          </p>
        </div>
        <button onClick={drip} className="btn-pill" disabled={busy}>
          {busy ? "Minting…" : "Get 5 devUSDC"}
          <span aria-hidden>→</span>
        </button>
      </div>
    </article>
  );
}
