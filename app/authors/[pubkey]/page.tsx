import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { Nav, PageBackdrop } from "../../components/Nav";
import { SkillCard, SkillCardData } from "../../components/SkillCard";
import {
  createReadOnlyCortexClient,
  formatToken,
  shortAddr,
  solscanAddrUrl,
} from "../../lib/cortex";

export const dynamic = "force-dynamic";

type AuthorParams = { params: Promise<{ pubkey: string }> };

export async function generateMetadata({ params }: AuthorParams) {
  const { pubkey } = await params;
  return {
    title: `Cortex — Author ${shortAddr(pubkey)}`,
    description: `Skills, revenue, and call volume for ${pubkey}.`,
  };
}

async function fetchAuthorSkills(pubkey: string): Promise<SkillCardData[]> {
  let author: PublicKey;
  try {
    author = new PublicKey(pubkey);
  } catch {
    return [];
  }
  try {
    const cortex = createReadOnlyCortexClient();
    const skills = await cortex.listSkills();
    return skills
      .filter((s) => s.author.equals(author))
      .map((s) => ({
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
    console.error("[authors] failed to load skills", err);
    return [];
  }
}

export default async function AuthorPage({ params }: AuthorParams) {
  const { pubkey } = await params;

  // Validate pubkey shape early so we 404 instead of rendering an
  // empty page for garbage input.
  try {
    new PublicKey(pubkey);
  } catch {
    notFound();
  }

  const skills = await fetchAuthorSkills(pubkey);

  const totalRevenueMicros = skills.reduce(
    (sum, s) => sum + BigInt(s.totalRevenue),
    0n
  );
  const totalCalls = skills.reduce(
    (sum, s) => sum + BigInt(s.totalCalls),
    0n
  );
  const liveSkills = skills.filter((s) => s.active);

  const top = [...skills]
    .sort((a, b) => Number(BigInt(b.totalRevenue) - BigInt(a.totalRevenue)))
    .slice(0, 5);

  return (
    <div className="relative min-h-screen text-white">
      <PageBackdrop />
      <Nav active="marketplace" />

      <main className="mx-auto max-w-7xl px-6 pt-32 pb-24 md:px-12">
        <header className="max-w-3xl space-y-6">
          <p className="eyebrow">Author</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-display text-3xl leading-tight font-medium tracking-tight text-white sm:text-4xl">
              {shortAddr(pubkey, 6)}
            </h1>
            <Link
              href={solscanAddrUrl(pubkey)}
              target="_blank"
              className="font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-200"
            >
              solscan ↗
            </Link>
          </div>
          <p className="font-mono text-xs break-all text-zinc-600">{pubkey}</p>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Live revenue dashboard for skills authored by this Solana
            keypair. Numbers come from the on-chain{" "}
            <code className="font-mono text-zinc-200">Skill</code> account
            counters — every call updates them atomically with the USDC
            transfer to this author&apos;s ATA.
          </p>
        </header>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Total revenue"
            value={`${formatToken(totalRevenueMicros.toString())} USDC`}
          />
          <Stat label="Total calls" value={totalCalls.toString()} />
          <Stat
            label="Live skills"
            value={`${liveSkills.length} / ${skills.length}`}
          />
        </section>

        {skills.length === 0 ? (
          <EmptyState pubkey={pubkey} />
        ) : (
          <>
            <section className="mt-16">
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="eyebrow">Top by revenue</h2>
                <span className="font-mono text-[11px] tracking-wider text-zinc-500">
                  {top.length} skill{top.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {top.map((s) => (
                  <SkillCard key={s.publicKey} skill={s} />
                ))}
              </div>
            </section>

            {skills.length > top.length ? (
              <section className="mt-16">
                <div className="mb-6 flex items-baseline justify-between">
                  <h2 className="eyebrow">All skills</h2>
                  <span className="font-mono text-[11px] tracking-wider text-zinc-500">
                    {skills.length} total
                  </span>
                </div>
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {skills.map((s) => (
                    <SkillCard key={s.publicKey} skill={s} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card relative overflow-hidden p-5">
      <div className="glass-highlight" />
      <div className="relative z-10 flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
          {label}
        </span>
        <span className="font-display text-2xl tracking-tight text-white">
          {value}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ pubkey }: { pubkey: string }) {
  return (
    <div className="glass-card relative mt-16 overflow-hidden p-10 text-center">
      <div className="glass-highlight" />
      <div className="relative z-10">
        <p className="font-mono text-xs tracking-widest uppercase text-zinc-500">
          No skills yet
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
          {shortAddr(pubkey, 6)} hasn&apos;t registered any skills on this
          program. Register one with{" "}
          <code className="font-mono text-zinc-200">cortex publish</code>{" "}
          (see <code className="font-mono text-zinc-200">cli/</code> in this
          repo).
        </p>
      </div>
    </div>
  );
}
