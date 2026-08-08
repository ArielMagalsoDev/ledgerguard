import { Code2, ExternalLink, Mail, UserRound } from "lucide-react";
import { AUTHOR } from "@/lib/portfolio";

const LINKS = [
  { href: AUTHOR.portfolio, label: "Portfolio", icon: ExternalLink },
  { href: AUTHOR.linkedin, label: "LinkedIn", icon: UserRound },
  { href: AUTHOR.github, label: "GitHub", icon: Code2 },
  { href: `mailto:${AUTHOR.email}`, label: "Contact", icon: Mail },
];

export function RecruiterBar() {
  return (
    <aside className="border-b border-dark-rule bg-ink text-dark-ink" aria-label="About the builder">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:px-8 md:flex-row md:items-center md:justify-between">
        <p className="text-sm">
          <strong className="font-semibold">Ariel Magalso</strong>
          <span className="text-dark-ink/50"> · </span>
          <span className="text-dark-ink/75">AI Automation Specialist · Philippines</span>
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Ariel Magalso links">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <a key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="inline-flex items-center gap-1.5 text-dark-ink/70 transition-colors hover:text-dark-ink">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
