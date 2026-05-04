import { Nav } from "../components/Nav";
import { SkillCard, SkillCardData } from "../components/SkillCard";
import { createReadOnlyCortexClient } from "../lib/cortex";

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
    <div className="min-h-screen bg-bg1 text-foreground">
      <Nav active="marketplace" />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Skill marketplace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Paid skills for AI agents
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted">
            Anyone can register a skill — a callable endpoint with a per-call
            price in devUSDC. Agents discover skills, settle each call on-chain,
            and revenue accrues to the author&apos;s ATA. No API keys, no
            monthly invoices.
          </p>
        </header>

        {skills.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => (
              <SkillCard key={s.publicKey} skill={s} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border-low bg-card p-10 text-center">
      <p className="font-mono text-sm uppercase tracking-wide text-muted">
        No skills yet
      </p>
      <p className="mt-2 max-w-md mx-auto text-sm text-muted">
        Run <code className="font-mono">npm run demo:seed</code> to register the
        demo skills, or pop a custom skill in via the SDK&apos;s{" "}
        <code className="font-mono">registerSkill()</code> helper.
      </p>
    </div>
  );
}
