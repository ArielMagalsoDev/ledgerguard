export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="font-tabular text-xs leading-relaxed text-ink-faint">
          LedgerGuard is a portfolio demonstration. Keystone Facilities Group,
          every supplier, purchase order, invoice, and dollar figure on this
          site is fictional. No real financial or supplier data is processed.
          No workflow — in this demo or described in its design — is capable
          of executing a payment.
        </p>
        <p className="mt-3 text-xs text-ink-faint">
          Built by Ariel Magalso · part of a three-project portfolio with
          Meridian Assist (support automation) and SignalDesk (revenue
          operations).
        </p>
      </div>
    </footer>
  );
}
