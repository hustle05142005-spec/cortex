import Link from "next/link";

type NavKey = "home" | "marketplace" | "agent" | "github";

const items: { href: string; label: string; key: NavKey; external?: boolean }[] = [
  { href: "/", label: "Overview", key: "home" },
  { href: "/marketplace", label: "Marketplace", key: "marketplace" },
  { href: "/agent", label: "Agent", key: "agent" },
];

export function Nav({ active }: { active?: NavKey }) {
  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between px-6 pt-6 pb-6 md:px-12">
      <Link
        href="/"
        className="flex items-center gap-2.5 font-display text-xl font-medium tracking-tight text-white transition-opacity hover:opacity-80"
      >
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full bg-white"
        />
        Cortex
      </Link>

      <nav className="hidden items-center gap-10 text-base font-normal text-zinc-400 md:flex">
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <Link
              key={it.key}
              href={it.href}
              className={
                isActive
                  ? "text-white"
                  : "transition-colors hover:text-zinc-200"
              }
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden items-center gap-4 md:flex">
        <Link
          href="https://github.com/hustle05142005-spec/cortex"
          target="_blank"
          className="btn-ghost"
        >
          GitHub
        </Link>
        <Link href="/marketplace" className="btn-pill">
          Browse skills
          <span aria-hidden>→</span>
        </Link>
      </div>
    </header>
  );
}

/** Subtle backdrop with vignette + ring shapes — fixed behind every page. */
export function PageBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
    >
      <div className="absolute top-0 left-1/2 z-10 h-[60vh] w-px -translate-x-1/2 bg-gradient-to-b from-zinc-400/30 via-zinc-500/5 to-transparent" />
      <div className="absolute top-[10%] left-1/2 z-10 h-56 w-48 -translate-x-1/2 rounded-full bg-zinc-400/10 blur-[100px]" />
      <div className="absolute -top-[50vh] h-[100vh] w-[150vw] rounded-[100%] border border-zinc-500/10 shadow-[0_0_120px_rgba(161,161,170,0.1)]" />
      <div className="absolute top-[20vh] h-[120vh] w-[120vw] rounded-[100%] border border-zinc-600/5 shadow-[0_0_80px_rgba(161,161,170,0.05)]" />
      <div className="absolute top-[30%] left-[15%] h-64 w-64 rounded-full bg-zinc-500/5 blur-[80px]" />
      <div className="absolute right-[20%] bottom-[20%] h-80 w-80 rounded-full bg-zinc-400/5 blur-[100px]" />
    </div>
  );
}
