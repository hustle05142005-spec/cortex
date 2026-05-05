"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { solscanTxUrl } from "../lib/cortex";

type Row = {
  signature: string;
  blockTime: number | null;
  err: string | null;
};

export function TxHistory({ pda }: { pda: PublicKey }) {
  const { connection } = useConnection();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sigs = await connection.getSignaturesForAddress(pda, {
          limit: 10,
        });
        if (cancelled) return;
        setRows(
          sigs.map((s) => ({
            signature: s.signature,
            blockTime: s.blockTime ?? null,
            err: s.err ? JSON.stringify(s.err) : null,
          }))
        );
      } catch (e) {
        console.error("[tx-history]", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pda, connection]);

  return (
    <article className="glass-card relative overflow-hidden p-7">
      <div className="glass-highlight" />
      <div className="relative z-10 space-y-5">
        <header className="flex items-center justify-between">
          <h3 className="font-display text-lg font-medium tracking-tight text-white">
            Recent transactions
          </h3>
          <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
            last {rows.length} on this PDA
          </p>
        </header>

        {loading && <p className="font-mono text-xs text-zinc-500">Loading…</p>}

        {!loading && rows.length === 0 && (
          <p className="font-mono text-xs text-zinc-500">
            No transactions yet — fund the vault and run a payment.
          </p>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.signature}
                href={solscanTxUrl(r.signature)}
                target="_blank"
                className="flex items-center justify-between rounded-md border border-white/5 bg-black/20 px-3 py-2 transition-colors hover:border-white/15"
              >
                <span className="font-mono text-xs text-zinc-200">
                  {r.signature.slice(0, 10)}…{r.signature.slice(-10)}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-zinc-500">
                    {r.blockTime
                      ? new Date(r.blockTime * 1000).toLocaleString()
                      : "—"}
                  </span>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-widest ${
                      r.err ? "text-red-300" : "text-emerald-300"
                    }`}
                  >
                    {r.err ? "failed" : "ok"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
