# Dependencies

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Skeleton |
| Last updated | TODO |
| Related | [implementation-plan.md](implementation-plan.md#dependencies), [../decisions/README.md](../decisions/README.md) |

## Policy

DCP will run this package across varied hospital systems. To keep it installable,
reproducible, and auditable on those systems:

- **Dependencies must be minimized.** Prefer the standard library or a small amount of our
  own code over adding a package.
- **Every dependency must be pinned to an exact version.** Version ranges (e.g. `^`, `~`,
  `>=`, `*`, `latest`) are **not allowed**.
- Transitive dependencies count. TODO: decide how transitive dependencies are reviewed and pinned.
- Every dependency must be listed in the table below and approved before it is used.
- Adding a dependency requires a decision record in [`specs/decisions/`](../decisions/README.md).

## Questions to answer before adding a dependency

- Can we avoid it with the standard library or a small amount of our own code?
- Does it run where it needs to (user machine, DCP worker, inference environment)?
- Is it compatible with the DCP worker runtime / WASM? (TODO: confirm DCP runtime constraints)
- Is its license compatible with a publicly available package? (TODO: project license — see open questions)
- How many transitive dependencies does it bring in?
- Is it needed at training time, inference time, or both? Does it affect R5 (inference
  without many dependencies)?

## Dependency table

| Package | Exact version | Used by | Runtime location | Why it is needed | License | DCP/WASM compatibility | Alternatives considered | Approved by |
|---|---|---|---|---|---|---|---|---|
