# Random Forest Test Plan

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Skeleton |
| Last updated | TODO |
| Related | [summary.md](summary.md), [implementation-plan.md](implementation-plan.md), [shared test plan](../shared/test-plan.md) |

> Each test should reference the requirement IDs it covers.

Test case format: `ID | description | requirement IDs | expected result | status`

## Unit tests

_What can be tested in isolation (local tree or statistic computation, combining,
prediction, serialization and loading)?_

- [ ] TODO

## Integration tests

_Do worker and coordinator logic produce a complete forest without live DCP?_

- [ ] TODO

## DCP end-to-end tests

_Does training succeed on real DCP using remote data and discrete jobs?_

- [ ] TODO

## Invalid-input tests

_What happens with invalid hyperparameters, mismatched schemas across sites, unsupported
feature types, or a site with too few rows?_

- [ ] TODO

## Partial-participation tests

_Is a valid forest produced when some sites do not participate (R8)? How does quality
change?_

- [ ] TODO

## Failed-job recovery tests

_After a failure, are completed slice results (trees or statistics) reused without
retraining (R9)?_

- [ ] TODO

## Model-quality checks

_How does the federated forest compare to a centralized baseline on pooled data? Which
metric, threshold, and dataset? (TODO: see open questions.)_

- [ ] TODO
- [ ] TODO: quality with heterogeneous sites (unequal sizes, skewed labels)

## Data-locality checks

_Do slice results contain only the expected trees or statistics and no raw rows (R6)? Do
shared values match what the privacy analysis says is shared?_

- [ ] TODO

## Serialization tests

_Does a serialized forest load and produce identical predictions? Does loading work with
only the minimal inference dependencies (R5)?_

- [ ] TODO

## Pass/fail criteria

_What must pass before this track is considered done?_

- TODO
