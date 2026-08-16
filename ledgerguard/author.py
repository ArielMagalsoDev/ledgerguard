"""Author/portfolio contact details.

Registered as a Jinja global in main.py (`templates.env.globals["AUTHOR"] =
AUTHOR`) so every template — header, footer, recruiter_proof, and any page —
can read it without each route threading it through by hand, mirroring how
`OUTCOME_META` (ledgerguard/outcome.py) is registered.
"""

AUTHOR: dict[str, str] = {
    "name": "Ariel Magalso",
    "role": "AI Engineer",
    "location": "Philippines",
    "email": "hello@arielmagalso.com",
    "portfolio": "https://arielmagalso.com",
    "linkedin": "https://www.linkedin.com/in/magalsoariel",
    "github": "https://github.com/ArielMagalsoDev",
    "repository": "https://github.com/ArielMagalsoDev/ledgerguard",
}
