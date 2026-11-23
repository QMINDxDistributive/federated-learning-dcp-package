# Shared Summary

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [implementation-plan.md](implementation-plan.md), [test-plan.md](test-plan.md), [open-questions.md](open-questions.md) |

> **Ownership rule.** This file holds what is true for every model track: purpose, users,
> scope, requirements, constraints, inputs, outputs, and releases. A track summary describes
> only what is specific to its model and links here for the rest. See the matching rule in the
> [shared implementation plan](implementation-plan.md).

## Purpose

QMIND and Distributive are building a proof-of-concept, publicly available package for running
federated learning on the Distributive Compute Platform (DCP). Training data stays on the
machines that hold it. Only model information moves through DCP. The target setting is hospital
systems that cannot pool patient data but can each run a worker.

The package has two model tracks:

- Logistic regression ([summary](../logistic-regression/summary.md)): the baseline, with Newton-style
  training and FedAvg.
- Random forest ([summary](../random-forest/summary.md)): a non-linear classifier built from trees
  trained at each site.

## Users

- **Coordinator user** (for example the central authority): picks the model type and settings,
  starts training, and receives the model.
- **Site operator** (for example a hospital): runs the worker script and supplies local data in the
  [agreed format](implementation-plan.md#site-data). Needs nothing model-specific beyond the data
  rules.
- **Model consumer** (clinician tooling, researchers): loads the exported JSON and predicts without
  installing this package or DCP (R5).

## Scope

In scope for the proof of concept:

- Binary classification with logistic regression and random forest.
- Training across sites on DCP, with one job per site per round.
- One model file envelope for both tracks, loadable and usable with no dependencies.
- Partial participation and saved results ([failure handling](implementation-plan.md#failure-handling)).
- A site agent that lets a machine join a session with one command.

## Non-goals

- Multiclass classification. Tests binarize multiclass data.
- Regression (continuous targets) in v0.1. The logistic regression track keeps a stretch goal for it
  ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)).
- Imputation of missing values and automatic feature engineering.
- Harmonizing data across hospitals. The package checks that data matches and warns about likely
  mismatches. Hospitals convert their own data ([harmonization](implementation-plan.md#data-harmonization)).
- Secure aggregation and differential privacy. Scoped as a risk, not built in v0.
- Federated hyperparameter search. Users set hyperparameters.
- Personalization (site-specific models).

## Functional requirements

### Requirements traceability

Every requirement maps to the spec sections that address it and to test coverage.

| ID | Requirement | Shared spec section | Logistic regression section | Random forest section | Test coverage | Status |
|---|---|---|---|---|---|---|
| R1 | Users can train one or more ML models using federated learning. | [Data flow](implementation-plan.md#data-flow) | [Training rounds](../logistic-regression/implementation-plan.md#training-rounds-or-aggregation) | [Site training and aggregation](../random-forest/implementation-plan.md#site-training-and-aggregation) | [S-I1, S-I2](test-plan.md#integration-tests), [LR-I1, LR-Q1 to LR-Q10](../logistic-regression/test-plan.md#model-quality-checks), [RF-T1, RF-T2, RF-T9](../random-forest/test-plan.md) | Draft |
| R2 | Users can specify model hyperparameters. | [Hyperparameter validation](implementation-plan.md#hyperparameter-validation) | [Hyperparameters](../logistic-regression/implementation-plan.md#how-hyperparameters-differ-between-methods) | [Hyperparameters](../random-forest/implementation-plan.md#candidate-hyperparameters) | [S-V1 to S-V3](test-plan.md#invalid-input-tests), [LR-V2 to LR-V5, LR-V12](../logistic-regression/test-plan.md#invalid-input-tests), [RF-T3](../random-forest/test-plan.md) | Draft |
| R3 | Federated training uses DCP. | [Discrete jobs](implementation-plan.md#discrete-jobs) | [Jobs and slice contents](../logistic-regression/implementation-plan.md#jobs-and-slice-contents) | [Jobs and slice contents](../random-forest/implementation-plan.md#jobs-and-slice-contents) | [S-E1, S-E2](test-plan.md#dcp-end-to-end-tests) | Draft |
| R4 | The primary API accepts hyperparameters and outputs trained model parameters. | [Public API](implementation-plan.md#public-api), [Model output format](implementation-plan.md#model-output-format) | [Model output format](../logistic-regression/implementation-plan.md#model-output-format) | [Serialization](../random-forest/implementation-plan.md#serialization-for-inference) | [S-U1](test-plan.md#unit-tests), [LR-I1](../logistic-regression/test-plan.md#integration-tests), [RF-T2, RF-T4](../random-forest/test-plan.md) | Draft |
| R5 | Trained model parameters can be used for inference without many dependencies or much boilerplate. | [Model output format](implementation-plan.md#model-output-format) | [Model output format](../logistic-regression/implementation-plan.md#model-output-format) | [Serialization](../random-forest/implementation-plan.md#serialization-for-inference) | [S-U1 to S-U4](test-plan.md#unit-tests), [LR-U7](../logistic-regression/test-plan.md#unit-tests), [RF-T4](../random-forest/test-plan.md) | Draft |
| R6 | No training data is transmitted via DCP; it remains on the machines performing the training. | [Data flow](implementation-plan.md#data-flow), [DCP remote data](implementation-plan.md#dcp-remote-data) | [Data flow](../logistic-regression/implementation-plan.md#data-flow) | [Privacy and result size](../random-forest/implementation-plan.md#privacy-and-result-size) | [S-L1 to S-L4](test-plan.md#data-locality-checks), [LR-L2, LR-L3](../logistic-regression/test-plan.md#data-locality-checks), [RF-T8](../random-forest/test-plan.md) | Draft. Weakened for v0.1 by [0001](../decisions/0001-v0-1-send-data-with-slices.md) |
| R7 | Training uses DCP remote data and discrete jobs. | [DCP remote data](implementation-plan.md#dcp-remote-data), [Discrete jobs](implementation-plan.md#discrete-jobs) | Loader only ([data source boundary](implementation-plan.md#data-flow)) | Loader only | [S-E1, S-E3, S-L3](test-plan.md) | Draft. Deferred for v0.1 by [0001](../decisions/0001-v0-1-send-data-with-slices.md) |
| R8 | Training succeeds even if not all expected workers participate. | [Failure handling](implementation-plan.md#failure-handling) | [Failure handling](../logistic-regression/implementation-plan.md#failure-handling) | [Failure handling](../random-forest/implementation-plan.md#failure-handling) | [S-P1, S-P2](test-plan.md#partial-participation-tests), [LR-P1 to LR-P4](../logistic-regression/test-plan.md#partial-participation-tests), [RF-T6](../random-forest/test-plan.md) | Draft |
| R9 | If a job fails after some slices complete, successful slice results are saved so that work does not need to be repeated. | [Result persistence](implementation-plan.md#result-persistence) | [Failure handling](../logistic-regression/implementation-plan.md#failure-handling) | [Failure handling](../random-forest/implementation-plan.md#failure-handling) | [S-C1 to S-C3](test-plan.md#failed-job-recovery-tests), [LR-I3, LR-C3](../logistic-regression/test-plan.md), [RF-T7](../random-forest/test-plan.md) | Draft |
| R10 | A worker script sets up and runs a DCP worker, joins the correct compute group, and hosts the local data used for training. | [Worker setup script](implementation-plan.md#worker-setup-script), [Compute groups](implementation-plan.md#compute-groups) | None. Uses the shared script | None. Uses the shared script | [S-E3, S-E4](test-plan.md#dcp-end-to-end-tests) | Draft. Prototype tested 2026-11-17 |

### Additional functional requirements

Track-specific requirements are defined in the track summaries (`LR-R1` to `LR-R3`). Requirements
that apply to both tracks are added here with new IDs (R11, ...).

- TODO

### Release plan

Following Alex's suggested order. Each track summary lists only what its track delivers in each release.

| Release | Shared delivers |
|---|---|
| v0.1 | Work functions and aggregation tested with the local runner. Data sent with slices ([0001](../decisions/0001-v0-1-send-data-with-slices.md)). The DCP loop is included if time allows (OQ13) |
| v0.2 | DCP loop with result saving, retries, and resume, if not done in v0.1 |
| Later | Remote data, with Distributive's help, restoring the full R6 and R7 |

> **v0.1 scope ([decision 0001](../decisions/0001-v0-1-send-data-with-slices.md), Proposed).** On
> Alex and Dan's advice, v0.1 sends each site's data with its slices and does not use remote data.
> R7 is deferred, and R6 becomes "training data appears only in slice inputs, never in results,
> saved results, logs, or the model". The full R6 and R7 return with remote data. Each track is
> designed so the switch changes only where a slice gets its rows, not the algorithms or payloads.
> The showcase demo already runs the remote data path ([0004](../decisions/0004-remote-data-on-site-laptops.md)).

## Constraints

- **Dependencies** are minimized and pinned to exact versions ([dependencies.md](dependencies.md)).
- **Data stays on the site** (R6). v0.1 uses public or synthetic data only.
- **Sandbox.** Work functions have no filesystem access and limited network access, and must be
  self-contained ([work function constraints](implementation-plan.md#work-function-constraints)).
- **Floating point.** Results differ slightly between devices, so tests compare within tolerances.
- **Compute groups.** Remote data needs one group per site, and only Distributive can create them
  ([compute groups](implementation-plan.md#compute-groups)).
- **Round budget.** Alex's target is training in under 1 day. Maximum time per round is 24 h divided
  by the number of rounds. Job latency is not measured yet ([S-E2](test-plan.md#dcp-end-to-end-tests)).
- **Hospital variety.** Sites record data differently ([harmonization](implementation-plan.md#data-harmonization)).
- **Licensing.** A public package needs a license (OQ4).

## Inputs

- **Hyperparameters:** model-specific settings plus the [shared settings](implementation-plan.md#hyperparameter-validation).
- **Site data:** one JSON file per site in the [agreed format](implementation-plan.md#site-data).
- **DCP configuration:** credentials (`DCP_API_KEY` or keystores in `~/.dcp/`) and compute groups
  ([credentials](../../demo/dcp-credentials.md)).

## Outputs

- **Trained model:** JSON in the [shared envelope](implementation-plan.md#model-output-format), plus
  the track's payload.
- **Training metadata:** resolved hyperparameters, participation by round, warnings, and timestamp,
  inside the model's `training` object.

## Open questions

Tracked in [open-questions.md](open-questions.md). Most important for both tracks:

- **OQ12 and OQ13:** inline or remote data for v0.1, and which release carries the DCP loop.
- **OQ10 and OQ11:** minimum participation, and where saved results live.
- **OQ5:** datasets for quality checks.
- **OQ14:** how a user chooses the model type.
