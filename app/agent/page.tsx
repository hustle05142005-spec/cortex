import Link from "next/link";
import { Nav, PageBackdrop } from "../components/Nav";
import {
  CORTEX_CLUSTER,
  CORTEX_PROGRAM_ID,
  shortAddr,
  solscanAddrUrl,
} from "../lib/cortex";
import { AgentDashboard } from "./AgentDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cortex — Agent Wallet",
  description:
    "Connect a wallet, manage an on-chain agent's spending limits, deposit and withdraw USDC, and see live tx history.",
};

export default function AgentPage() {
  return (
    <div className="relative min-h-screen text-white">
      <PageBackdrop />
      <Nav active="agent" />

      <main className="mx-auto max-w-5xl px-6 pt-32 pb-24 md:px-12">
        <header className="max-w-3xl space-y-6">
          <p className="eyebrow">Agent wallet</p>
          <h1 className="font-display text-4xl leading-[1.1] font-medium tracking-tight text-white sm:text-5xl md:text-6xl">
            On-chain spending
            <br />
            <span className="text-zinc-400">controls for your agent</span>
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg">
            Connect Phantom or Solflare. Cortex creates a PDA-owned vault and an
            operational agent signer. Per-call cap and a 24h daily ceiling are
            enforced by the on-chain program — even if the agent key leaks, your
            loss is bounded by the daily limit.
          </p>
        </header>

        <section className="mt-16">
          <AgentDashboard />
        </section>

        <FooterStats />
      </main>
    </div>
  );
}

function FooterStats() {
  return (
    <p className="mt-12 font-mono text-[11px] tracking-wider text-zinc-500">
      Program{" "}
      <Link
        href={solscanAddrUrl(CORTEX_PROGRAM_ID)}
        target="_blank"
        className="text-zinc-300 transition-colors hover:text-white"
      >
        {shortAddr(CORTEX_PROGRAM_ID, 6)} ↗
      </Link>{" "}
      on {CORTEX_CLUSTER}.
    </p>
  );
}
