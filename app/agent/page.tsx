import Link from "next/link";
import { Nav, PageBackdrop } from "../components/Nav";
import {
  CORTEX_CLUSTER,
  CORTEX_PROGRAM_ID,
  DEMO_AGENT_PUBKEY,
  createReadOnlyCortexClient,
  formatToken,
  shortAddr,
  solscanAddrUrl,
} from "../lib/cortex";
import { PublicKey } from "@solana/web3.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cortex — Agent Wallet",
  description: "Live view of an on-chain agent wallet, its limits and history.",
};

type AgentSnapshot = {
  publicKey: string;
  owner: string;
  agent: string;
  mint: string;
  perCallLimit: string;
  dailyLimit: string;
  dailySpent: string;
  totalCalls: string;
  totalSpent: string;
};

async function fetchAgent(agentPubkey: string): Promise<AgentSnapshot | null> {
  try {
    const cortex = createReadOnlyCortexClient();
    const wallet = await cortex.fetchAgentWallet(new PublicKey(agentPubkey));
    if (!wallet) return null;
    return {
      publicKey: wallet.publicKey.toBase58(),
      owner: wallet.owner.toBase58(),
      agent: wallet.agent.toBase58(),
      mint: wallet.mint.toBase58(),
      perCallLimit: wallet.perCallLimit.toString(),
      dailyLimit: wallet.dailyLimit.toString(),
      dailySpent: wallet.dailySpent.toString(),
      totalCalls: wallet.totalCalls.toString(),
      totalSpent: wallet.totalSpent.toString(),
    };
  } catch (err) {
    console.error("[agent] fetch failed", err);
    return null;
  }
}

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const params = await searchParams;
  const agentArg = params.agent ?? DEMO_AGENT_PUBKEY ?? null;
  const snapshot = agentArg ? await fetchAgent(agentArg) : null;

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
            An AgentWallet PDA holds your agent&apos;s funds and enforces a
            per-call cap and a 24h daily ceiling. The agent itself signs
            payments with a separate key — your owner key keeps the override.
          </p>
        </header>

        <section className="mt-16">
          {!agentArg ? (
            <UnsetState />
          ) : !snapshot ? (
            <NotFoundState agentPubkey={agentArg} />
          ) : (
            <Snapshot snapshot={snapshot} />
          )}
        </section>

        <FooterStats />
      </main>
    </div>
  );
}

function UnsetState() {
  return (
    <div className="glass-card relative overflow-hidden p-10 text-center">
      <div className="glass-highlight" />
      <div className="relative z-10">
        <p className="font-mono text-xs tracking-widest uppercase text-zinc-500">
          No demo agent configured
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
          Set{" "}
          <code className="font-mono text-zinc-200">
            NEXT_PUBLIC_DEMO_AGENT_PUBKEY
          </code>{" "}
          in your env, or pass{" "}
          <code className="font-mono text-zinc-200">?agent=&lt;pubkey&gt;</code>{" "}
          in the URL.
        </p>
      </div>
    </div>
  );
}

function NotFoundState({ agentPubkey }: { agentPubkey: string }) {
  return (
    <div className="glass-card relative overflow-hidden p-10 text-center">
      <div className="glass-highlight" />
      <div className="relative z-10">
        <p className="font-mono text-xs tracking-widest uppercase text-zinc-500">
          No wallet found
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
          No AgentWallet PDA exists for{" "}
          <code className="font-mono text-zinc-200">
            {shortAddr(agentPubkey)}
          </code>{" "}
          on {CORTEX_CLUSTER}. Run{" "}
          <code className="font-mono text-zinc-200">npm run demo:seed</code> and
          then{" "}
          <code className="font-mono text-zinc-200">npm run demo:agent</code> to
          create one.
        </p>
      </div>
    </div>
  );
}

function Snapshot({ snapshot }: { snapshot: AgentSnapshot }) {
  const dailyUsedPct =
    Number(snapshot.dailyLimit) > 0
      ? (Number(snapshot.dailySpent) / Number(snapshot.dailyLimit)) * 100
      : 0;

  return (
    <div className="space-y-6">
      <article className="glass-card relative overflow-hidden p-7">
        <div className="glass-highlight" />
        <div className="relative z-10 space-y-7">
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
                Wallet PDA
              </p>
              <Link
                href={solscanAddrUrl(snapshot.publicKey)}
                target="_blank"
                className="mt-1 inline-flex font-mono text-base text-zinc-100 transition-colors hover:text-white"
              >
                {shortAddr(snapshot.publicKey, 6)} ↗
              </Link>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-0.5 font-mono text-[10px] tracking-widest uppercase text-emerald-300">
              {CORTEX_CLUSTER}
            </span>
          </header>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
            <Field label="Owner" value={snapshot.owner} link />
            <Field label="Agent signer" value={snapshot.agent} link />
            <Field label="Mint" value={snapshot.mint} link />
            <Field
              label="Per-call limit"
              value={`${formatToken(snapshot.perCallLimit)} USDC`}
            />
            <Field
              label="Daily limit"
              value={`${formatToken(snapshot.dailyLimit)} USDC`}
            />
            <Field
              label="Daily spent"
              value={`${formatToken(snapshot.dailySpent)} USDC`}
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

      <div className="grid gap-5 md:grid-cols-2">
        <StatTile
          label="Lifetime calls"
          value={snapshot.totalCalls}
          unit="payments settled"
        />
        <StatTile
          label="Lifetime spent"
          value={formatToken(snapshot.totalSpent)}
          unit="devUSDC"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  link = false,
}: {
  label: string;
  value: string;
  link?: boolean;
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
        <p className="mt-1 font-mono text-sm text-zinc-100">{value}</p>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <article className="glass-card relative overflow-hidden p-6">
      <div className="glass-highlight" />
      <div className="relative z-10">
        <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
          {label}
        </p>
        <p className="mt-3 font-display text-3xl font-medium tracking-tight text-white">
          {value}
        </p>
        <p className="mt-1 font-mono text-[11px] tracking-wider text-zinc-500">
          {unit}
        </p>
      </div>
    </article>
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
