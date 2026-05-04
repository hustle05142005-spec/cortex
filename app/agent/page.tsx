import Link from "next/link";
import { Nav } from "../components/Nav";
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
    <div className="min-h-screen bg-bg1 text-foreground">
      <Nav active="agent" />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10 space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Agent wallet
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            On-chain spending controls for your agent
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted">
            An AgentWallet PDA holds your agent&apos;s funds and enforces a
            per-call limit and a 24h spending cap. The agent itself signs
            payments with a separate key — your owner key keeps the override.
          </p>
        </header>

        {!agentArg ? (
          <UnsetState />
        ) : !snapshot ? (
          <NotFoundState agentPubkey={agentArg} />
        ) : (
          <Snapshot snapshot={snapshot} />
        )}

        <FooterStats />
      </main>
    </div>
  );
}

function UnsetState() {
  return (
    <section className="rounded-2xl border border-dashed border-border-low bg-card p-10 text-center">
      <p className="font-mono text-sm uppercase tracking-wide text-muted">
        No demo agent configured
      </p>
      <p className="mt-2 max-w-md mx-auto text-sm text-muted">
        Set <code className="font-mono">NEXT_PUBLIC_DEMO_AGENT_PUBKEY</code> in
        your env, or pass{" "}
        <code className="font-mono">?agent=&lt;pubkey&gt;</code> in the URL.
      </p>
    </section>
  );
}

function NotFoundState({ agentPubkey }: { agentPubkey: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-border-low bg-card p-10 text-center">
      <p className="font-mono text-sm uppercase tracking-wide text-muted">
        No wallet found
      </p>
      <p className="mt-2 max-w-md mx-auto text-sm text-muted">
        No AgentWallet PDA exists for{" "}
        <code className="font-mono">{shortAddr(agentPubkey)}</code> on{" "}
        {CORTEX_CLUSTER}. Run{" "}
        <code className="font-mono">npm run demo:seed</code> and then{" "}
        <code className="font-mono">npm run demo:agent</code> to create one.
      </p>
    </section>
  );
}

function Snapshot({ snapshot }: { snapshot: AgentSnapshot }) {
  const dailyUsedPct =
    Number(snapshot.dailyLimit) > 0
      ? (Number(snapshot.dailySpent) / Number(snapshot.dailyLimit)) * 100
      : 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border-low bg-card p-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted">Wallet PDA</p>
            <Link
              href={solscanAddrUrl(snapshot.publicKey)}
              target="_blank"
              className="font-mono text-base underline-offset-2 hover:underline"
            >
              {shortAddr(snapshot.publicKey, 6)}
            </Link>
          </div>
          <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/80">
            {CORTEX_CLUSTER}
          </span>
        </header>

        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <Field label="Owner" value={snapshot.owner} link />
          <Field label="Agent signer" value={snapshot.agent} link />
          <Field label="Mint" value={snapshot.mint} link />
          <Field
            label="Per-call limit"
            value={`${formatToken(snapshot.perCallLimit)} devUSDC`}
          />
          <Field
            label="Daily limit"
            value={`${formatToken(snapshot.dailyLimit)} devUSDC`}
          />
          <Field
            label="Daily spent"
            value={`${formatToken(snapshot.dailySpent)} devUSDC`}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Daily budget used</span>
            <span className="font-mono">{dailyUsedPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full bg-foreground"
              style={{ width: `${Math.min(100, dailyUsedPct)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StatTile
          label="Lifetime calls"
          value={snapshot.totalCalls}
          unit="payments settled"
        />
        <StatTile
          label="Lifetime spent"
          value={`${formatToken(snapshot.totalSpent)}`}
          unit="devUSDC"
        />
      </div>
    </section>
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
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      {link ? (
        <Link
          href={solscanAddrUrl(value)}
          target="_blank"
          className="font-mono text-sm underline-offset-2 hover:underline"
        >
          {shortAddr(value, 6)}
        </Link>
      ) : (
        <p className="font-mono text-sm">{value}</p>
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
    <div className="rounded-2xl border border-border-low bg-card p-6">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{unit}</p>
    </div>
  );
}

function FooterStats() {
  return (
    <p className="mt-10 text-xs text-muted">
      Program{" "}
      <code className="font-mono">{shortAddr(CORTEX_PROGRAM_ID, 6)}</code> on{" "}
      {CORTEX_CLUSTER}.
    </p>
  );
}
