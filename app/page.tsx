import Link from "next/link";
import { Nav, PageBackdrop } from "./components/Nav";
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
  title: "Cortex — programmable wallets and a skill marketplace for AI agents",
  description:
    "Cortex is Solana-native infrastructure for AI agents: PDA wallets with hard spending limits and a skill registry that pays authors per call. Every call settles in a single SPL transfer.",
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
    <div className="relative min-h-screen text-white">
      <PageBackdrop />
      <Nav active="home" />

      <main className="mx-auto max-w-7xl px-6 pt-32 pb-24 md:px-12">
        {/* HERO */}
        <section className="grid gap-12 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-7">
            <p className="eyebrow mb-6">
              Cortex · {CORTEX_CLUSTER}
            </p>
            <h1 className="font-display text-5xl leading-[1.05] font-medium tracking-tight text-white/95 sm:text-6xl md:text-7xl">
              Programmable wallets
              <br />
              <span className="text-zinc-400">for AI agents</span>
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-zinc-400 md:text-lg">
              On-chain spending limits and a skill marketplace where every
              call settles in one SPL transfer. Author publishes, agent
              discovers, USDC moves — sub-cent payments at Solana speed.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href="/marketplace" className="btn-pill btn-pill-lg">
                Browse the marketplace
                <span aria-hidden>→</span>
              </Link>
              <Link href="/agent" className="btn-ghost btn-pill-lg">
                See live agent
              </Link>
            </div>

            <ul className="mt-10 space-y-3 text-sm text-zinc-400">
              {[
                ["On-chain limits", "per-call cap, daily cap, owner override"],
                ["Open registry", "any author can publish a paid skill"],
                ["Single-tx settlement", "PDA-signed CPI to author's ATA"],
              ].map(([head, body]) => (
                <li key={head} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-zinc-500"
                  />
                  <span>
                    <strong className="font-medium text-zinc-200">
                      {head}
                    </strong>
                    <span className="text-zinc-500"> : {body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* HERO MOCK — live agent vault tile */}
          <div className="md:col-span-5">
            <HeroVaultMock stats={stats} />
          </div>
        </section>

        {/* STATS */}
        <section className="mt-28 grid gap-4 md:grid-cols-4">
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

        {/* THREE ROLES */}
        <section className="mt-28">
          <p className="eyebrow">Three roles</p>
          <h2 className="mt-4 max-w-3xl font-display text-3xl font-medium tracking-tight text-white md:text-5xl">
            One program, three sides of the marketplace.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Tile
              num="01"
              title="Skill author"
              body="Register a slug, set a USDC price-per-call, link your manifest. Revenue accrues directly to your token account on every paid call."
              cta={{ href: "/marketplace", label: "See registry" }}
            />
            <Tile
              num="02"
              title="Agent owner"
              body="Open an AgentWallet PDA, set hard per-call and daily caps, deposit USDC. Hand the agent a separate signer; you keep the override and withdraw."
              cta={{ href: "/agent", label: "Live wallet" }}
            />
            <Tile
              num="03"
              title="Agent runtime"
              body="One pay_for_call instruction = one SPL transfer to the author. Limits are enforced on-chain; a runaway loop loses at most a day's budget."
              cta={{
                href: "https://github.com/hustle05142005-spec/cortex",
                label: "SDK + demo",
              }}
            />
          </div>
        </section>

        {/* HOW A CALL SETTLES */}
        <section className="mt-28">
          <p className="eyebrow">How a call settles</p>
          <h2 className="mt-4 max-w-3xl font-display text-3xl font-medium tracking-tight text-white md:text-5xl">
            One Solana transaction. Three guarantees.
          </h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                head: "Agent signs",
                body: "The agent runtime signs pay_for_call with its own keypair. Your owner key never has to be online.",
              },
              {
                step: "02",
                head: "Program enforces",
                body: "Skill is active · mint matches · price ≤ per-call limit · daily spent + price ≤ daily limit. Reverts otherwise.",
              },
              {
                step: "03",
                head: "USDC settles",
                body: "PDA-signed CPI moves price_per_call from the agent vault straight to the author's ATA. Counters update.",
              },
            ].map((s) => (
              <li
                key={s.step}
                className="glass-card relative overflow-hidden p-7"
              >
                <div className="glass-highlight" />
                <div className="relative z-10">
                  <p className="font-mono text-[11px] tracking-widest text-zinc-500">
                    STEP {s.step}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-medium tracking-tight text-white">
                    {s.head}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* FOOTER */}
        <footer className="mt-28 flex flex-col items-start gap-4 border-t border-white/5 pt-10 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
          <p>
            Built for Solana Summit Kazakhstan · YC RFS Summer 2026 (AI-Native
            Service Companies + Company Brain).
          </p>
          <Link
            href={solscanAddrUrl(CORTEX_PROGRAM_ID)}
            target="_blank"
            className="font-mono transition-colors hover:text-zinc-300"
          >
            program {shortAddr(CORTEX_PROGRAM_ID, 6)} ↗
          </Link>
        </footer>
      </main>
    </div>
  );
}

/** Hero mock — a glass-card pretending to be a live agent dashboard. */
function HeroVaultMock({ stats }: { stats: GlobalStats }) {
  return (
    <div className="relative">
      <article className="glass-card relative overflow-hidden p-6">
        <div className="glass-highlight" />
        <div className="relative z-10 space-y-6">
          <header className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
                Agent vault
              </p>
              <h3 className="mt-1 font-display text-lg font-medium tracking-tight text-white">
                cortex-demo-agent
              </h3>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[10px] tracking-widest uppercase text-emerald-300">
              Live
            </span>
          </header>

          <div className="rounded-2xl border border-white/5 bg-black/30 p-5">
            <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
              Daily budget used
            </p>
            <p className="mt-2 font-display text-3xl font-medium tracking-tight text-white">
              {formatToken(stats.totalRevenue)}{" "}
              <span className="text-zinc-500">/ 2.00 USDC</span>
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-zinc-200"
                style={{
                  width: `${Math.min(100, (Number(stats.totalRevenue) / 2_000_000) * 100)}%`,
                }}
              />
            </div>
          </div>

          <ul className="space-y-2 font-mono text-[11px] text-zinc-400">
            {[
              ["demo-price-feed", "0.02 USDC"],
              ["demo-summarize", "0.08 USDC"],
              ["demo-translate", "0.12 USDC"],
              ["demo-onchain-audit", "0.18 USDC"],
              ["demo-image-gen", "0.25 USDC"],
            ].map(([slug, amount]) => (
              <li
                key={slug}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-2"
              >
                <span className="text-zinc-300">{slug}</span>
                <span className="text-zinc-500">{amount}</span>
                <span className="text-emerald-300/80">settled</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between pt-2 text-[11px] text-zinc-500">
            <span className="font-mono">{stats.totalCalls.toString()} calls lifetime</span>
            <span className="font-mono">{stats.totalSkills} skills available</span>
          </div>
        </div>
      </article>
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
    <div className="glass-card relative overflow-hidden p-5">
      <div className="glass-highlight" />
      <div className="relative z-10">
        <p className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
          {label}
        </p>
        <p className="mt-3 font-display text-3xl font-medium tracking-tight text-white">
          {value}
        </p>
        {unit ? (
          <p className="mt-1 font-mono text-[11px] tracking-wider text-zinc-500">
            {unit}
          </p>
        ) : null}
      </div>
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
    <article className="glass-card relative flex h-full flex-col overflow-hidden p-7">
      <div className="glass-highlight" />
      <div className="relative z-10 flex h-full flex-col gap-4">
        <p className="font-mono text-[11px] tracking-widest text-zinc-500">
          {num}
        </p>
        <h3 className="font-display text-xl font-medium tracking-tight text-white">
          {title}
        </h3>
        <p className="flex-1 text-sm leading-relaxed text-zinc-400">{body}</p>
        <Link
          href={cta.href}
          className="mt-2 inline-flex items-center gap-1.5 self-start text-sm font-medium text-zinc-300 transition-colors hover:text-white"
        >
          {cta.label}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}
