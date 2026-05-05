import Link from "next/link";
import { formatToken } from "../lib/cortex";
import type { FeaturedTemplate } from "../lib/featured";

/**
 * Card for an unclaimed open-source agent-skill template. Visually
 * de-emphasised vs. live SkillCard — the chip reads "UNCLAIMED" and
 * the price is a suggestion, not an on-chain value.
 */
export function TemplateCard({ template }: { template: FeaturedTemplate }) {
  const repoUrl = `https://github.com/${template.repo}`;
  return (
    <article className="relative overflow-hidden rounded-3xl border border-dashed border-white/10 bg-white/[0.015] p-6 transition-colors hover:border-white/20">
      <div className="flex h-full flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-medium tracking-tight text-white">
              {template.name}
            </h3>
            <p className="font-mono text-xs text-zinc-500">
              {template.category}
            </p>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-2.5 py-0.5 font-mono text-[10px] tracking-widest uppercase text-amber-200/70">
            Unclaimed
          </span>
        </header>

        <p className="text-sm leading-relaxed text-zinc-400">
          {template.blurb}
        </p>

        <dl className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-xs">
          <Stat label="Suggested" value={formatToken(template.suggestedPrice)} unit="USDC" />
          <Stat label="GitHub" value={`★ ${template.stars}`} />
          <Stat label="Status" value="open" />
        </dl>

        <footer className="mt-auto flex items-center justify-between text-xs text-zinc-500">
          <Link
            href={repoUrl}
            className="font-mono transition-colors hover:text-zinc-200"
            target="_blank"
            rel="noreferrer"
          >
            {template.repo} ↗
          </Link>
          <span className="font-mono text-zinc-600">claim →</span>
        </footer>
      </div>
    </article>
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
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-[10px] tracking-widest uppercase text-zinc-500">
        {label}
      </dt>
      <dd className="font-mono text-sm text-zinc-100">
        {value}
        {unit ? <span className="ml-1 text-zinc-500">{unit}</span> : null}
      </dd>
    </div>
  );
}
