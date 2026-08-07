import Link from "next/link";

const NAV = [
  { href: "/demo", label: "Demo" },
  { href: "/queue", label: "Queue" },
  { href: "/evals", label: "Evals" },
  { href: "/architecture", label: "Architecture" },
  { href: "/operations", label: "Operations" },
];

// Traced from agero.framer.website's own status chip (an inline SVG, not a
// bordered/notched card): a single flared shape, flat and nearly full-width
// at the very top edge, tapering via concave curves to a narrower flat pill
// at the bottom where the dot + label sit. Path below is Agero's own,
// horizontally scaled (x *= 583/342, y untouched) to fit our longer label.
const CHIP_PATH =
  "M 9.30 0 C -92.47 0 676.5 0 573.6 0 C 470.7 0 533.2 36 432.5 36 C 331.9 36 184.3 36 152.5 36 C 46.5 36 111.1 0 9.30 0 Z";

export function SiteHeader() {
  return (
    <div className="sticky top-0 z-40 bg-paper">
      <header className="relative">
        <div className="flex justify-center">
          <div className="status-chip-shape">
            <svg viewBox="0 0 583 36" preserveAspectRatio="none" aria-hidden>
              <path d={CHIP_PATH} fill="var(--ink)" />
            </svg>
            <div className="relative flex h-full items-center justify-center gap-2 px-4 text-[11px] text-paper-raised sm:text-xs">
              <span className="status-chip-dot" />
              <span className="whitespace-nowrap">Live pipeline · real Claude extraction</span>
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 pb-4 pt-9 sm:px-8 sm:pt-10">
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
