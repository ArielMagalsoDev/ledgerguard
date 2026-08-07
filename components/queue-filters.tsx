"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function QueueFilters({ suppliers, properties }: { suppliers: string[]; properties: Array<[string, string]> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplier = searchParams.get("supplier") ?? "";
  const property = searchParams.get("property") ?? "";

  function update(next: { supplier?: string; property?: string }) {
    const qs = new URLSearchParams(searchParams.toString());
    const merged = { supplier, property, ...next };
    if (merged.supplier) qs.set("supplier", merged.supplier);
    else qs.delete("supplier");
    if (merged.property) qs.set("property", merged.property);
    else qs.delete("property");
    const s = qs.toString();
    router.push(s ? `/queue?${s}` : "/queue");
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
      <span className="text-ink-faint">Filter:</span>
      <select
        value={supplier}
        onChange={(e) => update({ supplier: e.target.value })}
        className="rounded border border-rule bg-paper px-2 py-1 text-ink"
      >
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={property}
        onChange={(e) => update({ property: e.target.value })}
        className="rounded border border-rule bg-paper px-2 py-1 text-ink"
      >
        <option value="">All properties</option>
        {properties.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      {(supplier || property) && (
        <Link href="/queue" className="text-ink-muted underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
          Clear filters
        </Link>
      )}
    </div>
  );
}
