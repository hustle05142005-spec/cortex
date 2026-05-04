import Link from "next/link";
import { Nav } from "./components/Nav";
import {
  CORTEX_CLUSTER,
  CORTEX_PROGRAM_ID,
  createReadOnlyCortexClient,
  formatToken,
  shortAddr,
  solscanAddrUrl,
} from "./lib/cortex";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cortex — Solana-native infrastructure for AI agents",
  description:
    "Programmable agent wallet + on-chain skill marketplace. Pay for any skill at the speed of an SPL transfer.",
};

type GlobalStats = {
  totalSkills: number;
  totalAgents: number;
  totalCalls: bigint;
  totalRevenue: bigint;
};

async function fetchStats(): Promise<GlobalStats> {
  try {
    const cortex = createReadOnlyCortexClient();
    const [skills, agents] = await Promise.all([
      cortex.listSkills(),
      cortex.listAgentWallets(),
    ]);

    const totals = skills.reduce(
      (acc, s) => {
        acc.calls += BigInt(s.totalCalls.toString());
        acc.revenue += BigInt(s.totalRevenue.toString());
        return acc;
      },
      { calls: 0n, revenue: 0n }
    );

    return {
      totalSkills: skills.length,
      totalAgents: agents.length,
      totalCalls: totals.calls,
      totalRevenue: totals.revenue,
    };
  } catch (err) {
    console.error("[home] stats fetch failed", err);
    return {
      totalSkills: 0,
      totalAgents: 0,
      totalCalls: 0n,
      totalRevenue: 0n,
    };
  }
}

export default async function Home() {
  const stats = await fetchStats();

  return (
    <div className="min-h-screen bg-bg1 text-foreground">
      <Nav active="home" />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <header className="space-y-4">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Cortex // {CORTEX_CLUSTER}
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Programmable wallets and a skill marketplace for AI agents, settled
            on Solana.
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted">
            Cortex gives every AI agent a PDA-owned vault with hard per-call and
            daily spending limits, and a global registry of paid skills. Authors
            publish, agents discover, every call settles in a single SPL
            transfer — sub-cent payments at Solana speed.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/marketplace"
              className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-bg1 hover:opacity-90"
            >
              Browse skills →
            </Link>
            <Link
              href="/agent"
              className="rounded-full border border-border-low px-5 py-2 text-sm font-semibold hover:bg-card"
            >
              View agent wallet
            </Link>
            <Link
              href={solscanAddrUrl(CORTEX_PROGRAM_ID)}
              target="_blank"
              className="rounded-full border border-border-low px-5 py-2 text-sm font-mono hover:bg-card"
            >
              program {shortAddr(CORTEX_PROGRAM_ID, 6)}
            </Link>
          </div>
        </header>

        <section className="mt-16 grid gap-4 md:grid-cols-4">
          <Stat
            label="Skills registered"
            value={stats.totalSkills.toString()}
          />
          <Stat label="Agent wallets" value={stats.totalAgents.toString()} />
          <Stat
            label="Calls settled"
            value={stats.totalCalls.toString()}
            unit="lifetime"
          />
          <Stat
            label="Volume"
            value={formatToken(stats.totalRevenue)}
            unit="devUSDC"
          />
        </section>

        <section className="mt-20 grid gap-6 md:grid-cols-3">
          <Tile
            num="01"
            title="Skill author"
            body="Register a slug, set price-per-call in USDC, publish the manifest URL. Earn revenue every time an agent calls your endpoint, no monthly invoice."
            cta={{ href: "/marketplace", label: "See registry" }}
          />
          <Tile
            num="02"
            title="Agent owner"
            body="Spin up an AgentWallet PDA, set hard per-call and daily limits, deposit USDC. Hand the agent a separate signer key — your owner key keeps the override and withdraw."
            cta={{ href: "/agent", label: "Live wallet" }}
          />
          <Tile
            num="03"
            title="Agent runtime"
            body="One pay_for_call instruction = one SPL transfer to the author. Limits are enforced on-chain so a runaway loop can lose at most a day's budget."
            cta={{
              href: "https://github.com/hustle05142005-spec/cortex",
              label: "SDK + demo",
            }}
          />
        </section>

        <section className="mt-20 rounded-3xl border border-border-low bg-card p-8 md:p-12">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            How a call settles
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            One Solana transaction, three guarantees.
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "1",
                head: "Agent signs",
                body: "The agent runtime signs pay_for_call with its own keypair. Your owner key never has to be online.",
              },
              {
                step: "2",
                head: "Program enforces",
                body: "On-chain checks: skill is active, mint matches, price ≤ per-call limit, daily spent + price ≤ daily limit.",
              },
              {
                step: "3",
                head: "USDC settles",
                body: "PDA-signed CPI transfers price_per_call from the agent vault straight to the author&apos;s ATA. Counters update.",
              },
            ].map((s) => (
              <li
                key={s.step}
                className="rounded-2xl border border-border-low bg-bg1 p-5"
              >
                <p className="font-mono text-xs text-muted">step {s.step}</p>
                <p className="mt-1 text-base font-semibold">{s.head}</p>
                <p
                  className="mt-2 text-sm text-muted"
                  dangerouslySetInnerHTML={{ __html: s.body }}
                />
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-16 border-t border-border-low pt-6 text-xs text-muted">
          Built for Solana Summit Kazakhstan · YC RFS Summer 2026 (AI-Native
          Service Companies + Company Brain). Source on{" "}
          <Link
            href="https://github.com/hustle05142005-spec/cortex"
            className="underline underline-offset-2 hover:text-foreground"
          >
            GitHub
          </Link>
          .
        </footer>
      </main>
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
  unit?: string;
}) {
  return (
    <div className="rounded-2xl border border-border-low bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold">{value}</p>
      {unit ? <p className="mt-1 text-xs text-muted">{unit}</p> : null}
    </div>
  );
}

function Tile({
  num,
  title,
  body,
  cta,
}: {
  num: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border border-border-low bg-card p-6">
      <p className="font-mono text-xs text-muted">{num}</p>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p
        className="flex-1 text-sm text-muted"
        dangerouslySetInnerHTML={{ __html: body }}
      />
      <Link
        href={cta.href}
        className="mt-2 self-start text-sm font-medium underline underline-offset-2 hover:text-foreground"
      >
        {cta.label} →
      </Link>
    </article>
  );
}
