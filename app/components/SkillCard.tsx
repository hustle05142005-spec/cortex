import Link from "next/link";
import { shortAddr, formatToken } from "../lib/cortex";

export type SkillCardData = {
  publicKey: string;
  slug: string;
  name: string;
  description: string;
  manifestUri: string;
  pricePerCall: string;
  totalCalls: string;
  totalRevenue: string;
  author: string;
  active: boolean;
};

export function SkillCard({ skill }: { skill: SkillCardData }) {
  return (
    <article className="glass-card relative overflow-hidden p-6">
      <div className="glass-highlight" />
      <div className="relative z-10 flex h-full flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-medium tracking-tight text-white">
              {skill.name}
            </h3>
            <p className="font-mono text-xs text-zinc-500">{skill.slug}</p>
          </div>
          <span
            className={
              skill.active
                ? "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[10px] tracking-widest uppercase text-emerald-300"
                : "rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 font-mono text-[10px] tracking-widest uppercase text-zinc-500"
            }
          >
            {skill.active ? "Live" : "Off"}
          </span>
        </header>

        <p className="text-sm leading-relaxed text-zinc-400">
          {skill.description}
        </p>

        <dl className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-xs">
          <Stat
            label="Price / call"
            value={`${formatToken(skill.pricePerCall)}`}
            unit="USDC"
          />
          <Stat label="Calls" value={skill.totalCalls} />
          <Stat
            label="Revenue"
            value={formatToken(skill.totalRevenue)}
            unit="USDC"
          />
        </dl>

        <footer className="mt-auto flex items-center justify-between text-xs text-zinc-500">
          <Link
            href={`/authors/${skill.author}`}
            className="font-mono transition-colors hover:text-zinc-200"
            title={`Author dashboard for ${skill.author}`}
          >
            ↳ {shortAddr(skill.author)}
          </Link>
          {skill.manifestUri ? (
            <a
              href={skill.manifestUri}
              className="transition-colors hover:text-zinc-200"
              target="_blank"
              rel="noreferrer"
            >
              manifest →
            </a>
          ) : null}
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
