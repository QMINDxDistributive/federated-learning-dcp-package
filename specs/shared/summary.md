# Shared Summary

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Skeleton |
| Last updated | TODO |
| Related | [implementation-plan.md](implementation-plan.md), [test-plan.md](test-plan.md), [open-questions.md](open-questions.md) |

## Purpose

_What problem does this package solve, and why federated learning on DCP?_

- TODO

## Users

_Who will use the package? Who runs workers and hosts data? Who consumes the trained model?_

- TODO: users who start training
- TODO: operators who run DCP workers and host local data (e.g. hospital sites)
- TODO: users who run inference with trained models

## Scope

_What is in scope for the proof of concept?_

- Logistic regression track (see [logistic-regression/summary.md](../logistic-regression/summary.md))
- Random forest track (see [random-forest/summary.md](../random-forest/summary.md))
- TODO

## Non-goals

_What is explicitly out of scope for the proof of concept?_

- TODO

## Functional requirements

### Requirements traceability

Every requirement must map to the spec sections that address it and to test coverage.
Fill in the TODO columns as specs are written.

| ID | Requirement | Shared spec section | Logistic regression section | Random forest section | Test coverage | Status |
|---|---|---|---|---|---|---|
| R1 | Users can train one or more ML models using federated learning. | TODO | TODO | TODO | TODO | Not started |
| R2 | Users can specify model hyperparameters. | TODO | TODO | TODO | TODO | Not started |
| R3 | Federated training uses DCP. | TODO | TODO | TODO | TODO | Not started |
| R4 | The primary API accepts hyperparameters and outputs trained model parameters. | TODO | TODO | TODO | TODO | Not started |
| R5 | Trained model parameters can be used for inference without many dependencies or much boilerplate. | TODO | TODO | TODO | TODO | Not started |
| R6 | No training data is transmitted via DCP; it remains on the machines performing the training. | TODO | TODO | TODO | TODO | Not started |
| R7 | Training uses DCP remote data and discrete jobs. | TODO | TODO | TODO | TODO | Not started |
| R8 | Training succeeds even if not all expected workers participate. | TODO | TODO | TODO | TODO | Not started |
| R9 | If a job fails after some slices complete, successful slice results are saved so that work does not need to be repeated. | TODO | TODO | TODO | TODO | Not started |
| R10 | A worker script sets up and runs a DCP worker, joins the correct compute group, and hosts the local data used for training. | TODO | TODO | TODO | TODO | Not started |

### Additional functional requirements

_Are there requirements beyond R1–R10? Add them with new IDs (R11, ...) and add rows above._

- TODO

## Constraints

_What limits the design? Consider DCP runtime limits, hospital system variety, privacy,
dependency policy ([dependencies.md](dependencies.md)), and licensing for a public package._

- Dependencies must be minimized and pinned to exact versions (see [dependencies.md](dependencies.md)).
- Training data must not leave the machine that holds it (R6).
- TODO

## Inputs

_What does a user provide to start training? What does a worker site provide?_

- TODO: hyperparameters (see public API in [implementation-plan.md](implementation-plan.md#public-api))
- TODO: local data hosted by each worker (format: TODO)
- TODO: DCP configuration (compute group, credentials: TODO)

## Outputs

_What does training return? In what format? How is it used for inference?_

- TODO: trained model parameters (format: see [implementation-plan.md](implementation-plan.md#model-output-format))
- TODO: training metadata / logs?

## Open questions

Tracked in [open-questions.md](open-questions.md). Summarize the most important here:

- TODO
