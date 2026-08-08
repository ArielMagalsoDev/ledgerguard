export const AUTHOR = {
  name: "Ariel Magalso",
  role: "AI Automation Specialist",
  location: "Philippines",
  email: "hello@arielmagalso.com",
  portfolio: "https://arielmagalso.com",
  about: "https://arielmagalso.com/#about",
  contact: "https://arielmagalso.com/#contact",
  linkedin: "https://www.linkedin.com/in/magalsoariel",
  github: "https://github.com/ArielMagalsoDev",
  repository: "https://github.com/ArielMagalsoDev/ledgerguard",
} as const;

export const PORTFOLIO_PROJECTS = [
  {
    name: "Meridian Assist",
    href: "https://provenance.arielmagalso.com",
    role: "Customer support",
    proof: "RAG, citations, claim verification, refusal, escalation",
    current: false,
  },
  {
    name: "SignalDesk",
    href: "https://verdict.arielmagalso.com",
    role: "Revenue operations",
    proof: "Enrichment, identity resolution, deterministic scoring, CRM safety",
    current: false,
  },
  {
    name: "Ledger Guard",
    href: "https://ledgerguard.arielmagalso.com",
    role: "Finance operations",
    proof: "Document extraction, financial controls, matching, approvals, accounting integration",
    current: true,
  },
] as const;
