import Link from "next/link";
import { shortAddr, solscanAddrUrl, formatToken } from "../lib/cortex";

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
    <article className="flex flex-col gap-3 rounded-2xl border border-border-low bg-card p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{skill.name}</h3>
          <p className="font-mono text-xs text-muted">{skill.slug}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
            skill.active
              ? "bg-cream text-foreground/80"
              : "bg-foreground/10 text-muted"
          }`}
        >
          {skill.active ? "Live" : "Disabled"}
        </span>
      </header>

      <p className="text-sm text-muted">{skill.description}</p>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Price / call</dt>
          <dd className="font-mono text-foreground">
            {formatToken(skill.pricePerCall)} devUSDC
          </dd>
        </div>
        <div>
          <dt className="text-muted">Total calls</dt>
          <dd className="font-mono text-foreground">{skill.totalCalls}</dd>
        </div>
        <div>
          <dt className="text-muted">Revenue</dt>
          <dd className="font-mono text-foreground">
            {formatToken(skill.totalRevenue)} devUSDC
          </dd>
        </div>
      </dl>

      <footer className="flex items-center justify-between text-xs text-muted">
        <Link
          href={solscanAddrUrl(skill.author)}
          className="font-mono underline-offset-2 hover:underline"
          target="_blank"
        >
          author {shortAddr(skill.author)}
        </Link>
        {skill.manifestUri ? (
          <a
            href={skill.manifestUri}
            className="underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            manifest →
          </a>
        ) : null}
      </footer>
    </article>
  );
}
