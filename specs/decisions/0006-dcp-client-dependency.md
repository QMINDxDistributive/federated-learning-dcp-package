# 0006: Pin dcp-client 5.9.0 as the only runtime dependency

| Field | Value |
|---|---|
| Title | Pin dcp-client 5.9.0 as the only runtime dependency |
| Status | Proposed |
| Date | 2026-11-23 |
| Owners | Theo |
| Affects | [dependencies.md](../shared/dependencies.md), `package.json`, R3, R5 |

## Context

The package submits jobs to DCP (R3), which needs DCP's client library. `package.json` listed
`"dcp-client": "^5.9.0"`. The [dependency policy](../shared/dependencies.md) bans version ranges
and requires every dependency to be approved and recorded here. The lockfile already resolves
to 5.9.0.

## Options considered

### Option 1: Pin dcp-client to exactly 5.9.0

- Description: Depend on `dcp-client` `5.9.0` with no range. Load it lazily so local training
  and inference work without it.
- Pros: DCP's official client. Matches the version already in the lockfile. Reproducible installs.
- Cons: Brings in many transitive packages (about 257 in `package-lock.json`). Upgrades need
  a new decision record.

### Option 2: Call DCP without dcp-client

- Description: Reimplement job submission against DCP's network protocol.
- Pros: No transitive packages.
- Cons: Undocumented surface, large effort, likely to break when DCP changes.

## Decision

Option 1. Pin `dcp-client` to exactly `5.9.0`. Only the DCP runners (`src/runners/dcp*.js`)
and the demo may load it. `src/index.js` loads it lazily, so local runs, tests and inference
do not need it.

## Consequences

- `package.json` and `package-lock.json` list `"dcp-client": "5.9.0"`.
- R5 is unaffected: exported models need no dependencies to predict.
- The policy's open TODO on reviewing transitive dependencies applies here, since dcp-client
  brings in about 257 transitive packages.
- Upgrading dcp-client requires a new decision record that supersedes this one.
