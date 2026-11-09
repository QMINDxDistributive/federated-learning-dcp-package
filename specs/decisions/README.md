# Decision Records

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Skeleton |
| Last updated | TODO |

Decision records capture significant choices, why they were made, and what they affect.
Specs should link to the decision behind any non-obvious choice instead of restating the
reasoning.

## When to write a decision record

- A choice affects more than one spec or both model tracks
- A choice constrains the public API or model output format
- A dependency is added, removed, or changes version (see [dependencies.md](../shared/dependencies.md))
- An open question in [open-questions.md](../shared/open-questions.md) is resolved
- TODO: other triggers?

## How to record a decision

1. Copy [template.md](template.md) to `NNNN-short-title.md` using the next unused
   four-digit number (`0001`, `0002`, ...).
2. Fill in every section. Set status to `Proposed`.
3. Add a row to the index below.
4. Link the record from every affected spec section and open question.
5. Open a pull request. Reviewers: at least one from each affected track
   (see [CONTRIBUTING.md](../../CONTRIBUTING.md)).
6. After approval and merge, set status to `Accepted`.
7. Never rewrite an accepted decision. Write a new one and mark the old one
   `Superseded by NNNN`.

Status values: `Proposed`, `Accepted`, `Rejected`, `Superseded by NNNN`.

## Index

| # | Title | Status | Date | Owners |
|---|---|---|---|---|
