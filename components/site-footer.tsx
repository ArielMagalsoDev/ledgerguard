import Link from "next/link";

const NAV = [
  { href: "/demo", label: "Demo" },
  { href: "/queue", label: "Queue" },
  { href: "/evals", label: "Evals" },
  { href: "/architecture", label: "Architecture" },
  { href: "/operations", label: "Operations" },
];

export function SiteFooter() {
  return (
    <footer className="section-dark mt-24">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-display text-2xl tracking-tight text-dark-ink">
              LedgerSentry<span className="text-accent">.</span>
            </span>
            <p className="mt-3 max-w-sm text-sm text-ink-muted">
              Built by Ariel Magalso · part of a three-project portfolio with
              Meridian Assist (support automation) and SignalDesk (revenue
              operations).
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-ink-muted transition-colors hover:text-dark-ink">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-10 border-t border-dark-rule pt-6 font-tabular text-xs leading-relaxed text-ink-muted">
          LedgerSentry is a portfolio demonstration. Keystone Facilities Group,
          every supplier, purchase order, invoice, and dollar figure on this
          site is fictional. No real financial or supplier data is processed.
          No workflow — in this demo or described in its design — is capable
          of executing a payment.
        </p>
      </div>
    </footer>
  );
}
