import { Nav, PageBackdrop } from "../components/Nav";
import { SkillCard, SkillCardData } from "../components/SkillCard";
import { TemplateCard } from "../components/TemplateCard";
import { createReadOnlyCortexClient } from "../lib/cortex";
import { FEATURED_TEMPLATES } from "../lib/featured";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cortex — Skill Marketplace",
  description: "On-chain catalogue of paid skills for AI agents.",
};

async function fetchSkills(): Promise<SkillCardData[]> {
  try {
    const cortex = createReadOnlyCortexClient();
    const skills = await cortex.listSkills();
    return skills.map((s) => ({
      publicKey: s.publicKey.toBase58(),
      slug: s.slug,
      name: s.name,
      description: s.description,
      manifestUri: s.manifestUri,
      pricePerCall: s.pricePerCall.toString(),
      totalCalls: s.totalCalls.toString(),
      totalRevenue: s.totalRevenue.toString(),
      author: s.author.toBase58(),
      active: s.active,
    }));
  } catch (err) {
    console.error("[marketplace] failed to load skills", err);
    return [];
  }
}

export default async function MarketplacePage() {
  const skills = await fetchSkills();

  return (
    <div className="relative min-h-screen text-white">
      <PageBackdrop />
      <Nav active="marketplace" />

      <main className="mx-auto max-w-7xl px-6 pt-32 pb-24 md:px-12">
        <header className="max-w-3xl space-y-6">
          <p className="eyebrow">Skill marketplace</p>
          <h1 className="font-display text-4xl leading-[1.1] font-medium tracking-tight text-white sm:text-5xl md:text-6xl">
            Paid skills for
            <br />
            <span className="text-zinc-400">autonomous agents</span>
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg">
            Anyone can register a skill — a callable endpoint with a per-call
            price in devUSDC. Agents discover skills, settle each call on-chain,
            and revenue accrues directly to the author&apos;s ATA. No API keys,
            no monthly invoices.
          </p>
        </header>

        <section className="mt-16">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="eyebrow">Live on-chain</h2>
            <span className="font-mono text-[11px] tracking-wider text-zinc-500">
              {skills.length} skill{skills.length === 1 ? "" : "s"}
            </span>
          </div>
          {skills.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {skills.map((s) => (
                <SkillCard key={s.publicKey} skill={s} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-24">
          <div className="mb-6 max-w-3xl space-y-3">
            <h2 className="eyebrow">Featured templates</h2>
            <p className="font-display text-2xl leading-snug font-medium tracking-tight text-white sm:text-3xl">
              Open-source agent skills, ready to claim
            </p>
            <p className="text-sm leading-relaxed text-zinc-400">
              Maintainers add a <code className="font-mono text-zinc-200">cortex.toml</code> with
              a Solana pubkey, run <code className="font-mono text-zinc-200">cortex publish</code>,
              and start earning per-call USDC. Until then, these cards are just
              recruiting surfaces — Cortex never collects royalties on
              unclaimed code.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURED_TEMPLATES.map((t) => (
              <TemplateCard key={t.slug} template={t} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass-card relative overflow-hidden p-10 text-center">
      <div className="glass-highlight" />
      <div className="relative z-10">
        <p className="font-mono text-xs tracking-widest uppercase text-zinc-500">
          No skills yet
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
          Run{" "}
          <code className="font-mono text-zinc-200">npm run demo:seed</code> to
          register the demo skills, or call{" "}
          <code className="font-mono text-zinc-200">registerSkill()</code> from
          the SDK.
        </p>
      </div>
    </div>
  );
}
