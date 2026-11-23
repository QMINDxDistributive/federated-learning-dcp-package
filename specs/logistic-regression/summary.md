# Logistic Regression Summary

| Field | Value |
|---|---|
| Owner | Theo, TODO: second team member (OQ1) |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [implementation-plan.md](implementation-plan.md), [test-plan.md](test-plan.md), [shared summary](../shared/summary.md) |

> This summary covers only what is specific to logistic regression. Users, non-goals shared with
> the other track, the site data format, harmonization, DCP, failure handling, the model
> envelope, and releases are in the [shared summary](../shared/summary.md) and
> [shared implementation plan](../shared/implementation-plan.md).
>
> Sources: *Federated Learning Research Summary* and *Federated Learning Requirements and
> Constraints* (Drive › QMIND x Distributive › Research), team meeting 2026-11-04, meeting
> with Alex Salgo 2026-11-05, team meeting 2026-11-08. Values marked **Proposed** are this
> draft's suggestions and need team agreement (and a decision record where
> [CONTRIBUTING.md](../../CONTRIBUTING.md) requires one). Choices the track owner accepted on
> 2026-11-14 are recorded in [0002](../decisions/0002-newton-default-method.md) and [0003](../decisions/0003-lr-scope-site-rules-class-weights.md).

## Purpose

The logistic regression track delivers federated binary logistic regression on DCP. It
is the project's baseline model and priority 1 from the research phase because it:

- is convex, so there is one optimum and federated training can match the pooled fit;
- sends one number per feature (FedAvg) or a small matrix (Newton-style), so payloads are tiny;
- gives coefficients that read as odds ratios, which clinicians already understand;
- works with a few hundred patients per site, the expected size of a hospital PsA cohort;
- needs only a dot product and a sigmoid for inference, so it runs anywhere (R5).

**Why two methods.** Round count is the main feasibility unknown on DCP: each round is at
least one DCP job per site and pays set-up, scheduling and retrieval cost. The two methods trade
round count against what each site reveals:

| | Newton-style | FedAvg |
|---|---|---|
| Rounds to converge (research estimate) | about 5 to 10 | about 10 to 50 |
| Site sends per round | gradient, Hessian, sample count, loss | coefficients, sample count, loss |
| Payload per site (d features incl. intercept) | d + d(d+1)/2 + 2 numbers | d + 2 numbers |
| Result vs pooled training | Equal to pooled Newton (up to floating point) | Approaches pooled; biased toward large sites when sites differ |
| Information revealed | More (Hessian is a weighted covariance of the site's data) | Less |
| Tolerates a missing site mid-round | Poorly (step is wrong for the full objective) | Well (weighted average of responders) |

The methods are **interchangeable aggregation options inside one implementation**, not two
separate builds (team decision, 2026-11-04). **Newton-style is the default**
([0002](../decisions/0002-newton-default-method.md)): it needs the fewest rounds, equals pooled training, and has no learning
rate to tune. FedAvg stays fully supported for high-dimensional data, where a Newton update
would be larger than a site's data, or when stricter privacy is needed. Both are tested
against each other and against a centralized baseline.

## Users

The same three groups as the [shared summary](../shared/summary.md#users). One logistic
regression detail: the coordinator user picks `method` and the other hyperparameters.

## Scope

In scope for the proof of concept:

- Binary logistic regression with an intercept and L2 regularisation.
- Newton-style federated training (sites send gradient and Hessian; coordinator takes the step).
- FedAvg (sites run local gradient descent; coordinator takes a sample-weighted average).
- Federated feature standardization (one statistics round before training).
- Optional class weights for rare outcomes (`classWeight`, [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)).
- One model output, the same for both methods.
- The [shared failure handling](../shared/implementation-plan.md#failure-handling) for both methods,
  with the per-method rules in [Failure handling](implementation-plan.md#failure-handling).

## Non-goals

Beyond the [shared non-goals](../shared/summary.md#non-goals):

- Continuous targets (DAPSA, PASI scores) in v0.1. These need linear regression. Stretch goal after
  v0.1: least squares is a single Newton step, so it reuses the Newton plumbing and trains in one
  round ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)).
- Secure aggregation. Sharing the Hessian is accepted for v0.1 only because v0.1 uses public data
  ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)).
- Personalization (site-specific intercepts). Listed as a later mitigation for non-IID data.

## Functional requirements

How this track addresses R1–R10 (the logistic regression column of the
[traceability table](../shared/summary.md#requirements-traceability)):

| ID | Where this track addresses it |
|---|---|
| R1 | [Training rounds](implementation-plan.md#training-rounds-or-aggregation): both methods produce one global model |
| R2 | [Hyperparameters](implementation-plan.md#how-hyperparameters-differ-between-methods) |
| R3 | [Jobs and slice contents](implementation-plan.md#jobs-and-slice-contents), on the [shared job design](../shared/implementation-plan.md#discrete-jobs) |
| R4 | `train()` returns the model object in [Outputs](#outputs) |
| R5 | [Model output format](implementation-plan.md#model-output-format): dependency-free `predictProba` |
| R6 | [Data flow](implementation-plan.md#data-flow): only aggregates appear in results |
| R7 | Deferred by [0001](../decisions/0001-v0-1-send-data-with-slices.md). Only the [loader](../shared/implementation-plan.md#data-flow) changes |
| R8 | [Failure handling](implementation-plan.md#failure-handling): per-method rules on top of the shared policy |
| R9 | [Failure handling](implementation-plan.md#failure-handling): per-round checkpoint fields |
| R10 | None. Uses the shared worker script |

Track-specific requirements:

- **LR-R1.** Newton-style training on data split across sites must give the same
  coefficients as centralized Newton on the pooled data, within a floating-point tolerance.
- **LR-R2.** The exported model must be usable with about 10 lines of plain JavaScript
  (or any language) and no dependencies.
- **LR-R3.** A hyperparameter that does not apply to the chosen method is rejected before
  any job is deployed. (The logistic regression case of [shared validation](../shared/implementation-plan.md#hyperparameter-validation).)

### Release plan

What logistic regression delivers in each [shared release](../shared/summary.md#release-plan):

| Release | Logistic regression delivers |
|---|---|
| v0.1 | Work function steps (`siteStats`, `newtonSiteStep`, `fedavgSiteStep`), aggregation (`newtonUpdate`, `fedavgUpdate`, convergence), model export. Tested with the local runner. Data sent with slices |
| v0.2 | Per-round checkpoints and resume on top of the shared result saving, if not done in v0.1 |
| Later | Remote data loader (the prototype already runs it for the demo) |

## Constraints

Beyond the [shared constraints](../shared/summary.md#constraints):

- **Round budget.** Maximum time per round is 24 h ÷ rounds: Newton (10 rounds) 2.4 h; FedAvg
  (50 rounds) about 29 min. Alex said logistic regression rounds are fast (2026-11-05), but round
  latency has not been measured yet.
- **Hessian size.** Newton payload grows as d². At 13 features (Fed-Heart-Disease) it is
  about 105 numbers; at 200 features it is about 20,000. Very high-dimensional inputs
  (e.g. omics; the PsA lipidomics test set has 292 features, about 43,000 numbers per site)
  favour FedAvg or prior feature reduction.
- **Small sites.** If a site has fewer rows than numbers it sends, its update can reveal
  much of its data. By default a site needs at least 50 rows and at least as many rows as
  the numbers it sends per round. A smaller site stops training, or only triggers a warning
  for public test data ([site size rule](implementation-plan.md#site-size-rule)).
- **No dependencies.** The d×d solve, sigmoid and gradient are small enough to write in
  plain JavaScript (see [Dependencies](implementation-plan.md#dependencies)).

## Inputs

**Hyperparameters common to both methods:** `method`, `l2`, `fitIntercept`, `standardize`,
`maxRounds`, `tolerance`, `minSiteRows`, `siteSizeCheck`, `classWeight`, `siteShiftWarning`. Every
track also accepts the [shared settings](../shared/implementation-plan.md#hyperparameter-validation)
(`minParticipants`, `roundTimeoutMs`, `maxRoundRetries`).

**Newton-style only:** `damping`.

**FedAvg only:** `learningRate`, `localEpochs`, `batchSize`, `proximalMu`.

Full table with defaults and valid ranges: [implementation-plan.md](implementation-plan.md#how-hyperparameters-differ-between-methods).

**Local data.** The [shared site data rules](../shared/implementation-plan.md#site-data) apply. In
addition, this track needs:

- no feature that is constant across all sites (its standard deviation would be 0);
- at least `minSiteRows` rows per site ([site size rule](implementation-plan.md#site-size-rule)).

Harmonization is covered in the [shared plan](../shared/implementation-plan.md#data-harmonization).
This track's contribution is the warn-only [site shift check](implementation-plan.md#site-shift-check).
The common data model for PsA is OQ-LR7.

## Outputs

`train()` returns a model in the [shared envelope](../shared/implementation-plan.md#model-output-format),
with the same payload for both methods:

- `coefficients` and `intercept` on the **original feature scale** (so they read as log-odds ratios);
- `standardization` means and standard deviations used during training (for transparency);
- `training.method`, `training.classWeights` (a class-weighted model's probabilities are not
  calibrated to the real prevalence), `training.rounds`, `training.converged`, and
  `training.finalLoss`.

Format and inference code: [implementation-plan.md](implementation-plan.md#model-output-format).

## Open questions

Added to [shared open questions](../shared/open-questions.md) with area `Logistic regression`:

Resolved on 2026-11-14 (decision records pending review):

- OQ-LR1: Binary only. [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)
- OQ-LR2: Linear regression is a stretch goal after v0.1. [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)
- OQ-LR3: Newton-style is the default. [0002](../decisions/0002-newton-default-method.md)
- OQ-LR4: `minSiteRows: "auto"` = max(50, numbers sent per round), plus `siteSizeCheck`. [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)
- OQ-LR5: Hessian sharing accepted for v0.1 public data; revisit before real patient data. [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)
- OQ-LR6: Retry, then proceed with responders if at least `minParticipants`, marking the round partial. [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)

Still open:

- OQ-LR7: How is real hospital data harmonized before training (shared data template,
  units, coding, missing values)?

Most important shared items for this track: **[decision 0001](../decisions/0001-v0-1-send-data-with-slices.md)**
(no remote data in v0.1) and **OQ13** (whether the DCP loop is in v0.1 or v0.2).
