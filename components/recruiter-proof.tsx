import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AUTHOR } from "@/lib/portfolio";

export function RecruiterProof({
  title = "Inspect the engineering behind the interface.",
  description = "Architecture, evaluations, source code, operational evidence, and current limitations are public.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="mx-auto mt-16 max-w-6xl px-5 sm:px-8">
      <div className="card-paper overflow-hidden lg:grid lg:grid-cols-[8rem_1fr_auto]">
        <div className="flex items-center justify-between gap-4 bg-accent p-6 text-white lg:flex-col lg:items-start">
          <span className="font-display text-4xl tracking-tight">AM</span>
          <span className="font-tabular text-[10px] uppercase leading-relaxed tracking-[0.14em] text-white/75">
            Solo<br className="hidden lg:block" /> build
          </span>
        </div>
        <div className="p-7 sm:p-8 lg:py-10">
          <p className="font-tabular text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Built by Ariel Magalso · AI Automation Specialist
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-2xl font-normal text-ink sm:text-3xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
        <div className="flex flex-col justify-center gap-4 border-t border-rule p-7 sm:p-8 lg:min-w-56 lg:border-l lg:border-t-0">
          <a href={`mailto:${AUTHOR.email}`} className="btn-pill btn-pill-primary justify-between">
            Contact Ariel <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm lg:flex-col lg:gap-3">
            <a href={AUTHOR.repository} target="_blank" rel="noopener noreferrer" className="text-ink-muted transition-colors hover:text-accent">Source code ↗</a>
            <Link href="/case-study" className="text-ink-muted transition-colors hover:text-accent">Read case study →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
