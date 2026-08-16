"""Shared "Three systems, one argument" escalation strip content — content
mirror of lib/projects.ts (byte-identical parity is enforced only across the
sibling TS repos, not this port)."""

PROJECTS = [
    {
        "id": "provenance",
        "order": 1,
        "name": "Provenance",
        "href": "https://provenance.arielmagalso.com",
        "domain": "Customer support",
        "stake": "Recoverable",
        "consequence": "A customer acts on a policy that doesn't exist.",
        "safeguard": "Answers below the groundedness threshold are discarded, not softened. Refusal is a successful outcome.",
    },
    {
        "id": "verdict",
        "order": 2,
        "name": "Verdict",
        "href": "https://verdict.arielmagalso.com",
        "domain": "Revenue operations",
        "stake": "Persists",
        "consequence": "A fabricated fact enters the CRM and becomes indistinguishable from truth.",
        "safeguard": "The model classifies; plain code does the arithmetic. Below the evidence floor, no score exists.",
    },
    {
        "id": "ledgerguard",
        "order": 3,
        "name": "LedgerGuard",
        "href": "https://ledgerguard.arielmagalso.com",
        "domain": "Finance operations",
        "stake": "Irreversible",
        "consequence": "An unverified invoice reaches a payment run.",
        "safeguard": "The workflow holds no payment authority. People approve; bank changes verify out of band.",
    },
]
