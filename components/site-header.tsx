import Link from "next/link";

const NAV = [
  { href: "/demo", label: "Demo" },
  { href: "/queue", label: "Queue" },
  { href: "/evals", label: "Evals" },
  { href: "/architecture", label: "Architecture" },
  { href: "/operations", label: "Operations" },
];

// Traced from agero.framer.website's own status chip (an inline SVG, not a
// bordered/notched card): a single flared shape, flat at the top edge,
// tapering via concave curves to a narrower flat pill at the bottom where
// the dot + label sit. Agero's own flare — the horizontal distance each
// side widens beyond the bottom pill — is a fixed ~83px, not a proportion
// of the pill width, so it's kept fixed here too (measured bottom pill
// width for our longer label + that same 83px flare each side), rather
// than naively scaling Agero's whole shape up to fit more text — that
// first attempt made the chip nearly twice as wide, relative to the page,
// as Agero's actual one.
const CHIP_PATH = "M 5 0 L 431 0 C 371 0 408 36 348 36 L 88 36 C 28 36 65 0 5 0 Z";

// Not sticky/fixed — Agero's own header scrolls away with the page
// (checked its computed style directly: position: relative, all the way
// up the ancestor chain). Matching that plain in-flow behavior here.
export function SiteHeader() {
  return (
    <div className="bg-paper-light">
      <header className="relative">
        <div className="flex justify-center">
          <div className="status-chip-shape">
            <svg viewBox="0 0 436 36" preserveAspectRatio="none" aria-hidden>
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
              Ledger Guard<span className="text-accent">.</span>
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
