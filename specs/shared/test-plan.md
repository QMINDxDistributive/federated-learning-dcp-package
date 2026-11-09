# Shared Test Plan

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Skeleton |
| Last updated | TODO |
| Related | [summary.md](summary.md), [implementation-plan.md](implementation-plan.md) |

> Covers shared components. Each test should reference the requirement IDs (R1–R10) it
> covers, and the traceability table in [summary.md](summary.md) should link back here.

Test case format: `ID | description | requirement IDs | expected result | status`

## Unit tests

_What shared logic can be tested in isolation (public API, hyperparameter validation,
model output serialization / loading, result persistence)?_

- [ ] TODO

## Integration tests

_How do shared components work together without a live DCP network? Do we need a local
or mocked DCP setup? (TODO: confirm what DCP provides for local testing.)_

- [ ] TODO

## DCP end-to-end tests

_What runs on real DCP? How many workers? Which compute group? What test data is used
(TODO: datasets — see open questions)?_

- [ ] TODO: worker setup script joins the correct compute group and hosts local data (R10)
- [ ] TODO: training completes via remote data and discrete jobs (R3, R7)

## Invalid-input tests

_What happens with invalid hyperparameters, malformed or missing local data, mismatched
schemas across sites, or a misconfigured worker?_

- [ ] TODO

## Partial-participation tests

_What happens when fewer workers join than expected? When one drops out mid-job? What is
the minimum to succeed (R8)?_

- [ ] TODO

## Failed-job recovery tests

_After a job fails partway, are completed slice results saved and reused without being
recomputed (R9)? How do we verify nothing was re-run?_

- [ ] TODO

## Model-quality checks

_How do we compare the federated result against a baseline? What baseline? What metrics
and thresholds? (Track-specific details in each track's test plan.)_

- [ ] TODO

## Data-locality checks

_How do we verify that no training data is transmitted via DCP (R6)? What do we inspect
(job inputs, slice results, network traffic, saved results)?_

- [ ] TODO

## Pass/fail criteria

_What must pass before a spec or release is considered done? Are there quality thresholds?_

- TODO
