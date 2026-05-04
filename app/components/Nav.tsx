import Link from "next/link";

export function Nav({ active }: { active?: string }) {
  const items: { href: string; label: string; key: string }[] = [
    { href: "/", label: "Overview", key: "home" },
    { href: "/marketplace", label: "Marketplace", key: "marketplace" },
    { href: "/agent", label: "Agent", key: "agent" },
    {
      href: "https://github.com/hustle05142005-spec/cortex",
      label: "GitHub",
      key: "github",
    },
  ];

  return (
    <nav className="flex items-center justify-between border-b border-border-low px-6 py-4">
      <Link href="/" className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-foreground" />
        <span className="text-sm font-mono uppercase tracking-[0.18em] text-foreground">
          Cortex
        </span>
      </Link>
      <ul className="flex items-center gap-6 text-sm">
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                className={
                  isActive
                    ? "text-foreground font-semibold underline underline-offset-4"
                    : "text-muted hover:text-foreground"
                }
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
