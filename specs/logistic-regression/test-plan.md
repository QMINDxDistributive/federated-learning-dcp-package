# Logistic Regression Test Plan

| Field | Value |
|---|---|
| Owner | Theo, TODO: second team member |
| Status | Skeleton |
| Last updated | TODO |
| Related | [summary.md](summary.md), [implementation-plan.md](implementation-plan.md), [shared test plan](../shared/test-plan.md) |

> Each test should reference the requirement IDs it covers and state which method it
> applies to (Newton-style, FedAvg, or both).

Test case format: `ID | method | description | requirement IDs | expected result | status`

## Unit tests

_What logic common to both methods can be tested in isolation (prediction, loss, output
serialization)? Method-specific unit tests are in the method sections below._

- [ ] TODO

## Integration tests

_Do coordinator and worker logic work together for several rounds without live DCP?_

- [ ] TODO

## DCP end-to-end tests

_Does each method train successfully on real DCP using remote data and discrete jobs?_

- [ ] TODO: Newton-style
- [ ] TODO: FedAvg

## Invalid-input tests

_What happens with invalid hyperparameters, hyperparameters for the wrong method,
non-numeric features, missing labels, or mismatched feature counts across sites?_

- [ ] TODO

## Partial-participation tests

_What happens to each method when a worker is missing for one round or for all rounds (R8)?_

- [ ] TODO: Newton-style
- [ ] TODO: FedAvg

## Failed-job recovery tests

_After a failure partway through a round, are completed slice results reused (R9)? Can
training resume from the last completed round?_

- [ ] TODO

## Model-quality checks

_How does each method compare to a centralized baseline trained on the pooled data? What
metric and threshold count as acceptable? Which dataset? (TODO: see open questions.)_

- [ ] TODO

## Data-locality checks

_Do slice results contain only the expected per-method values and no raw rows (R6)?_

- [ ] TODO

## Newton-style training tests

_Method-specific tests._

- [ ] TODO: per-participant values are computed correctly on known small inputs
- [ ] TODO: aggregation matches the equivalent centralized computation
- [ ] TODO: convergence criterion stops training as specified
- [ ] TODO: behaviour when convergence is not reached by the maximum number of rounds
- [ ] TODO: hyperparameter validation for Newton-specific hyperparameters

## FedAvg tests

_Method-specific tests._

- [ ] TODO: local training produces expected updates on known small inputs
- [ ] TODO: averaging (and weighting, if any) is computed correctly
- [ ] TODO: convergence / stopping criterion behaves as specified
- [ ] TODO: behaviour with unequal sample counts across sites
- [ ] TODO: hyperparameter validation for FedAvg-specific hyperparameters

## Pass/fail criteria

_What must pass for each method before this track is considered done?_

- Newton-style: TODO
- FedAvg: TODO
