import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="border-b border-rule bg-paper-light">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-end lg:py-20">
        <div>
          <p className="section-marker">({eyebrow})</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-normal leading-[1.08] text-ink sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <div className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">{description}</div>
          {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {aside && <div className="lg:min-w-48 lg:text-right">{aside}</div>}
      </div>
    </section>
  );
}
