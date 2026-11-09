# Contributing

> **This repository is currently specs only.** Contributions are markdown changes under
> `specs/`, `README.md`, and this file. Do not add implementation code or dependencies.

## Branch and pull request flow

1. Branch from `main`. Never commit directly to `main`.
2. Name branches `<area>/<short-description>`, where `<area>` is one of:
   `shared`, `logistic-regression`, `random-forest`, `decisions`, or `docs`.
   Example: `random-forest/split-statistics-prompts`.
3. Keep each pull request focused on one spec or one decision where possible.
4. In the pull request description, list:
   - which specs changed
   - which requirement IDs (R1–R10) are affected
   - any open questions added or resolved
   - any decision records added
5. Update the `Status` and `Last updated` fields at the top of each spec you change, and
   the status table in `README.md` if a status changed.
6. Merge only after the required approvals below.

## Review requirements

| Path changed | Required approvals |
|---|---|
| `specs/shared/` | At least one reviewer **from a model track other than the author's** |
| `specs/logistic-regression/` | At least one reviewer (TODO: confirm whether a track owner is required) |
| `specs/random-forest/` | At least one reviewer (TODO: confirm whether a track owner is required) |
| `specs/decisions/` | At least one reviewer from each track affected by the decision |
| `README.md`, `CONTRIBUTING.md` | At least one reviewer |

Model tracks:

- Logistic regression: Theo, TODO: second team member
- Random forest: Nate, Mohsan, Ivan

Example: if Theo changes `specs/shared/implementation-plan.md`, at least one of Nate,
Mohsan, or Ivan must approve.

## Writing specs

- Do not invent technical decisions, versions, APIs, datasets, or results.
- If something is unknown, leave a `TODO:` marker or add it to
  `specs/shared/open-questions.md`.
- When you resolve a TODO with a real choice, record the choice in `specs/decisions/`
  and link to it from the spec.
- Keep the header block (Owner, Status, Last updated) at the top of every spec.

### Status values

| Status | Meaning |
|---|---|
| Skeleton | Headings and prompts only |
| Draft | Content being written; may contain TODOs |
| In review | Open pull request; TODOs resolved or moved to open questions |
| Approved | Merged and agreed by the owners and required reviewers |

## Recording decisions

Use a decision record whenever a choice affects more than one spec, constrains the
public API, adds a dependency, or resolves an open question.

1. Copy `specs/decisions/template.md` to
   `specs/decisions/NNNN-short-title.md`, using the next unused four-digit number
   (`0001`, `0002`, ...).
2. Fill in every section of the template. Start with status `Proposed`.
3. Add the record to the index table in `specs/decisions/README.md`.
4. Link to the record from every spec section it affects.
5. If it resolves an open question, mark that question `Resolved` in
   `specs/shared/open-questions.md` and link the record.
6. Open a pull request. Set status to `Accepted` once it is approved and merged.
7. Do not edit an accepted decision to change it. Write a new record and mark the old
   one `Superseded by NNNN`.

See `specs/decisions/README.md` for details.
