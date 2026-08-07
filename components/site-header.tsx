import Link from "next/link";

const NAV = [
  { href: "/demo", label: "Demo" },
  { href: "/queue", label: "Queue" },
  { href: "/evals", label: "Evals" },
  { href: "/architecture", label: "Architecture" },
  { href: "/operations", label: "Operations" },
];

export function SiteHeader() {
  return (
    <div className="sticky top-0 z-40">
      {/* Agero's floating "Available for New Projects" chip, repurposed as a
          standing-fact announcement — true on every page, not a vanity claim. */}
      <div className="flex justify-center bg-paper pt-3">
        <span className="status-chip">
          <span className="status-chip-dot" />
          Live pipeline · real Claude extraction
        </span>
      </div>
      <header className="border-b border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-xl tracking-tight text-ink">
              LedgerSentry<span className="text-accent">.</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/demo" className="btn-pill btn-pill-primary">
            Run demo
          </Link>
        </div>
        {/* Mobile nav — no hamburger/overlay yet, just wraps under the bar. */}
        <nav className="flex items-center gap-1 overflow-x-auto px-5 pb-3 text-sm md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full px-3 py-1.5 text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
    </div>
  );
}
