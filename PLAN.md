# Ledger Guard — Recruiter-first site plan

## Objective

Reorganize the public site so a recruiter can understand who built Ledger
Guard, what was built, why it is technically credible, and how to contact the
builder without sacrificing the depth of the working product demonstration.

## Audience

- AI Automation Specialist recruiters and hiring managers
- Applied AI and workflow-engineering leads
- Solutions engineering and automation clients
- Technical reviewers who want implementation proof

## Information hierarchy

1. **Candidate identity** — establish Ariel's ownership and target role in the
   project-at-a-glance section without adding a second global navigation bar.
2. **Product promise** — one clear statement of the business problem and the
   system boundary.
3. **Measured proof** — held-out results, false-clearance rate, dataset size,
   and solo ownership.
4. **Project ownership** — problem, solution, role, stack, evaluation approach,
   and safety boundary.
5. **Technical judgment** — evidence provenance, three-way matching, duplicate
   prevention, and controlled approvals.
6. **Product model** — the four safe invoice outcomes and a direct path into
   the live demo.
7. **Business relevance** — illustrative impact calculator, clearly separated
   from measured technical results.
8. **Portfolio breadth** — links to the other two AI automation projects.
9. **Conversion** — contact and workbench calls to action.

## Homepage section order

```text
Project navigation
Hero + primary actions
Measured proof strip
Project at a glance + candidate ownership
Technical controls
Four safe outcomes
Illustrative business impact
Three-project portfolio
Demo call to action
Recruiter contact call to action
Footer
```

## Global page pattern

Every primary page follows the same evidence-first hierarchy:

```text
Purpose-led page introduction
Strongest measurable or operational proof
Working interface or detailed evidence
Honest limitations and boundaries
Recruiter proof + source + contact conversion
```

### Demo

Interactive product proof → scenario selector → current decision summary →
document and extracted evidence → matching and controls → proposed action and
audit history.

### Queue

Human-review purpose → live backlog summary → filters → outcome groups →
server-checked actions → reviewer boundary and auditability.

### Evaluations

Evaluation claim → held-out headline → methodology and split explanation →
per-metric and per-case results → failure analysis → dataset limitations.

### Architecture

System boundary → AI/code/human responsibility split → pipeline → tolerance
policy → security and privacy → stack and integration limitations.

### Operations

Operational claim → live aggregates → backlog and exception evidence →
integration health → invoice-level latency and cost → alerts and missing
production capabilities.

### Case study

Candidate ownership → business problem → design decision → implementation →
risk controls → evaluation → limitations → live product evidence.

## Design rules

- Preserve Ledger Guard's neutral paper, black, and orange identity.
- Remove the decorative marquee from the primary information flow.
- Use strong section contrast and generous whitespace instead of many equally
  weighted blocks.
- Keep measured results visually distinct from illustrative ROI.
- Keep the primary recruiter actions visible near the top and at the end.
- Keep product navigation compact; detailed operational pages remain available
  without competing with the candidate story.
- Support mobile widths without horizontal page overflow.

## Success criteria

A new visitor should be able to answer these questions within 30 seconds:

- Who built this?
- What role is Ariel targeting?
- What business workflow does Ledger Guard automate?
- What did Ariel personally implement?
- What evidence shows the system works?
- What safety boundary makes the automation credible?
- Where can I inspect the demo and source code?
- How can I contact Ariel?

## Verification

- ESLint passes.
- Next.js production build and TypeScript checks pass.
- All primary routes render without console errors.
- Desktop and mobile layouts show no horizontal page overflow.
- Recruiter links, source code, demo, evaluations, and portfolio projects remain
  reachable.
