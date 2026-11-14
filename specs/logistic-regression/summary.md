# Logistic Regression Summary

| Field | Value |
|---|---|
| Owner | Theo, TODO: second team member (OQ1) |
| Status | Draft |
| Last updated | 2026-11-14 |
| Related | [implementation-plan.md](implementation-plan.md), [test-plan.md](test-plan.md), [shared summary](../shared/summary.md) |

> Sources: *Federated Learning Research Summary* and *Federated Learning Requirements and
> Constraints* (Drive › QMIND x Distributive › Research), team meeting 2026-11-04, meeting
> with Alex Salgo 2026-11-05, team meeting 2026-11-08. Values marked **Proposed** are this
> draft's suggestions and need team agreement (and a decision record where
> [CONTRIBUTING.md](../../CONTRIBUTING.md) requires one). Choices the track owner accepted on
> 2026-11-14 are recorded in [0002](../decisions/0002-newton-default-method.md) and [0003](../decisions/0003-lr-scope-site-rules-class-weights.md).

## Purpose

The logistic regression track delivers federated binary logistic regression on DCP. It is
the project's baseline model and priority 1 from the research phase because it:

- is convex, so there is one optimum and federated training can match the pooled fit;
- sends one number per feature (FedAvg) or a small matrix (Newton-style), so payloads are tiny;
- gives coefficients that read as odds ratios, which clinicians already understand;
- works with a few hundred patients per site, the expected size of a hospital PsA cohort;
- needs only a dot product and a sigmoid for inference, so it runs anywhere (R5).

**Why two methods.** Round count is the main feasibility unknown on DCP: each round is at
least one DCP job and pays set-up, scheduling and retrieval cost. The two methods trade
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

Same three groups as the [shared summary](../shared/summary.md#users):

- **Coordinator user** (e.g. the central authority, UHN in Alex's pipeline): picks
  `method`, sets hyperparameters, starts training, receives the model.
- **Site operator** (hospital): runs the worker and provides local data in the agreed
  format. Nothing logistic-regression-specific beyond the data rules in [Inputs](#inputs).
- **Model consumer** (clinician tooling, researchers): loads the exported JSON and predicts
  without installing this package.

## Scope

In scope for the proof of concept:

- Binary logistic regression with an intercept and L2 regularisation.
- Newton-style federated training (sites send gradient and Hessian; coordinator takes the step).
- FedAvg (sites run local gradient descent; coordinator takes a sample-weighted average).
- Federated feature standardization (one statistics round before training).
- Optional class weights for rare outcomes (`classWeight`, [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)).
- One shared model output format, the same for both methods.
- Partial participation and resume-from-checkpoint for both methods.

## Non-goals

- Multiclass (softmax) logistic regression ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)). UCI Dermatology is 6-class, so
  tests binarize it (psoriasis vs rest).
- Continuous targets (DAPSA, PASI scores) in v0.1. These need linear regression, not
  logistic regression. Stretch goal after v0.1: least squares is a single Newton step, so it
  reuses the Newton plumbing and trains in one round ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)).
- Secure aggregation and differential privacy. Scoped as a risk, not built in v0. Sharing
  the Hessian is accepted for v0.1 only because v0.1 uses public data ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)).
- Automatic feature engineering, interaction terms, or imputation of missing values.
- Federated hyperparameter search. Users set hyperparameters; tuning is out of scope.
- Personalization (site-specific models or intercepts). Listed as a later mitigation for
  non-IID data.

## Functional requirements

How this track addresses R1–R10 (copy into the logistic regression column of the
[traceability table](../shared/summary.md#requirements-traceability)):

| ID | Where this track addresses it |
|---|---|
| R1 | [Training rounds](implementation-plan.md#training-rounds-or-aggregation): both methods produce one global model |
| R2 | [Hyperparameters](implementation-plan.md#how-hyperparameters-differ-between-methods) |
| R3 | [DCP job design](implementation-plan.md#dcp-job-design): one job per site per round |
| R4 | `train()` returns the model object in [Outputs](#outputs) |
| R5 | [Model output format](implementation-plan.md#model-output-format): plain JSON, dependency-free predict |
| R6 | [Data flow](implementation-plan.md#data-flow): only aggregates appear in results. v0.1 sends rows in slice inputs ([0001](../decisions/0001-v0-1-send-data-with-slices.md)) |
| R7 | Deferred by [0001](../decisions/0001-v0-1-send-data-with-slices.md). The [data loader](implementation-plan.md#data-source-boundary) is the only part that changes |
| R8 | [Failure handling](implementation-plan.md#failure-handling): `minParticipants`, per-method rules |
| R9 | [Failure handling](implementation-plan.md#failure-handling): per-round checkpoints, per-site result cache |
| R10 | Shared worker script; no track-specific needs |

Track-specific requirements:

- **LR-R1.** Newton-style training on data split across sites must give the same
  coefficients as centralized Newton on the pooled data, within a floating-point tolerance.
- **LR-R2.** The exported model must be usable with about 10 lines of plain JavaScript
  (or any language) and no dependencies.
- **LR-R3.** A hyperparameter that does not apply to the chosen method is rejected before
  any job is deployed.

> **v0.1 scope ([decision 0001](../decisions/0001-v0-1-send-data-with-slices.md), Proposed).**
> On Alex and Dan's advice, v0.1 sends each site's data with its slices and does not use
> remote data. R7 is deferred, and R6 becomes "training data appears only in slice inputs,
> never in results, checkpoints, logs or the model". The full R6/R7 return when remote data
> is added. This track is designed so that switch only changes *where a slice gets its rows*,
> not the algorithms or payloads (see
> [Data source boundary](implementation-plan.md#data-source-boundary)).

### Release plan

Following Alex's suggested order:

| Release | Logistic regression delivers |
|---|---|
| v0.1 | Work function steps (`siteStats`, `newtonSiteStep`, `fedavgSiteStep`), aggregation (`newtonUpdate`, `fedavgUpdate`, convergence), model export. Tested with the local runner. Data sent with slices. The DCP loop is included if time allows (OQ13) |
| v0.2 | DCP training loop with result saving, retries, and resume, if not done in v0.1 |
| Later | Remote data (with Distributive's help), restoring the full R6 and R7 |

## Constraints

- **Round budget.** Alex's target is under 1 day for training. 24 h ÷ rounds gives the
  maximum time per round: Newton (10 rounds) 2.4 h; FedAvg (50 rounds) about 29 min.
  Alex said logistic regression rounds are fast (2026-11-05), but round latency has not
  been measured yet.
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
- **Floating point.** Results differ slightly between devices; all comparisons use tolerances.
- **Sandbox.** Work functions have no filesystem access and limited network access.

## Inputs

**Shared hyperparameters** (both methods): `method`, `l2`, `fitIntercept`, `standardize`,
`maxRounds`, `tolerance`, `minParticipants`, `minSiteRows`, `siteSizeCheck`, `classWeight`, `siteShiftWarning`,
`roundTimeoutMs`, `maxRoundRetries`.

**Newton-style only:** `damping`.

**FedAvg only:** `learningRate`, `localEpochs`, `batchSize`, `proximalMu`.

Full table with defaults and valid ranges: [implementation-plan.md](implementation-plan.md#how-hyperparameters-differ-between-methods).

**Local data rules** (on top of the shared data format, TODO in the shared spec):

- Every feature is numeric. Categorical features are already encoded, identically at every site.
- Every site has the same features in the same order, with the same names.
- The label column is binary, coded `0`/`1`.
- No missing values in v0. A row with a missing value fails validation (imputation is a non-goal).
- Each site has at least `minSiteRows` rows ([site size rule](implementation-plan.md#site-size-rule)) and at least one row of each class.

### Data harmonization

Real hospitals record the same information differently: different column names, units
(e.g. cholesterol in mg/dL vs mmol/L), category coding, missing columns, missing values,
and outcome definitions (e.g. ACR20 at 3 vs 6 months). Different *patients* at each site
are expected and handled by training. Different *recording* of the same thing is not, and
some of it (units, outcome definitions) passes validation silently.

**How real projects handle it.** Federated health networks agree on a common data model up
front: one document listing every column, its unit, its coding, and how the outcome is
defined. Each hospital writes a small conversion script that turns its own records into
that format, and that script runs inside the hospital before the package ever sees the
data.

**What this package does.** Its job is to check, not to fix. Hospitals convert their own
data into the agreed format, and round 0 validates it (feature names and order, numeric
values, binary labels, both classes present, site size). Round 0 also runs a warn-only
[site shift check](implementation-plan.md#site-shift-check): a site whose feature averages
or spread are far from the other sites' is flagged, which catches most unit and coding
mismatches. Harmonization itself is outside the package. The shape of the common data model for PsA (columns, units, coding, outcome
definition, missing-value rule) is OQ-LR7.

## Outputs

`train()` returns a model object with the same shape for both methods:

- `coefficients` and `intercept` on the **original feature scale** (so they read as log-odds ratios);
- `featureNames`, in order;
- `standardization` means and standard deviations used during training (for transparency);
- the class weights used (a class-weighted model's probabilities are not calibrated to the
  real prevalence);
- `training` metadata: method, hyperparameters, rounds run, converged or not, final loss,
  and which sites took part in each round;
- a `formatVersion`.

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
