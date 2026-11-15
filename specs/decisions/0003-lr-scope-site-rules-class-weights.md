# 0003: Logistic regression v0.1 scope, site rules and class weights

| Field | Value |
|---|---|
| Title | Logistic regression v0.1 scope, site rules and class weights |
| Status | Proposed |
| Date | 2026-11-14 |
| Owners | Theo |
| Affects | [LR summary](../logistic-regression/summary.md) (Scope, Non-goals, Constraints, Inputs, Outputs); [LR implementation plan](../logistic-regression/implementation-plan.md) (Round 0, Site size rule, Class weights, hyperparameters, Failure handling, Privacy, Dependencies, Work breakdown); [LR test plan](../logistic-regression/test-plan.md); resolves OQ-LR1, OQ-LR2, OQ-LR4, OQ-LR5, OQ-LR6 |

## Context

The logistic regression draft left six open questions (OQ-LR1 to OQ-LR6) and several
**Proposed** design choices. The track owner reviewed them on 2026-11-14. This record
bundles the resulting choices because they are small, affect only this track, and were
decided together. OQ-LR3 (default method) has its own record,
[0002](0002-newton-default-method.md).

A new need also came up: the real use case (biologic response in PsA) will likely have
rare outcomes, which plain logistic regression handles poorly.

## Options considered

### OQ-LR1: Multiclass

- Option A: binary only. Option B: add softmax (multiclass).
- Binary covers the target use case (respond / do not respond). Multiclass adds a second
  algorithm for no current need.

### OQ-LR2: Continuous targets (DAPSA, PASI)

- Option A: linear regression in v0.1. Option B: stretch goal after v0.1. Option C: out of scope.
- Least-squares linear regression is a single Newton step (weights W = I), so it can reuse
  the Newton plumbing and train in one round. It is cheap, but it is not needed to prove the
  federated method.

### OQ-LR4: Minimum rows per site

- Option A: one fixed number. Option B: tie it to how many numbers a site sends.
- A site with fewer rows than the numbers it sends can expose much of its data, so a fixed
  number is too weak at high d and too strict at low d.

### OQ-LR5: Sharing the Newton Hessian

- Option A: accept for v0.1. Option B: block Newton until secure aggregation exists.
- v0.1 uses public data only ([0001](0001-v0-1-send-data-with-slices.md)), so there is no
  patient data to protect yet.

### OQ-LR6: Newton round with a missing site

- Option A: wait or abort. Option B: retry, then proceed with responders and mark the round.
- Waiting forever blocks training on one bad site. Proceeding breaks equality with pooled
  training for that run.

### Class weights (new)

- Option A: none. Option B: user-supplied weights only. Option C: `null`, `"balanced"` or
  user-supplied weights, with `"balanced"` computed from **global** class counts.
- Per-site balancing would give each site a different objective and break Newton's
  equality with pooled training. Global counts are already collected in round 0.

## Decision

- **OQ-LR1:** binary only. Multiclass datasets are binarized for tests (e.g. Dermatology:
  psoriasis vs rest).
- **OQ-LR2:** linear regression is a stretch goal after v0.1 (work breakdown task 12).
- **OQ-LR4:** `minSiteRows: "auto"` (default) = max(50, numbers the site sends per round):
  Newton d + d(d+1)/2 + 2, FedAvg d + 2, with d counting the intercept. An integer overrides
  it. New `siteSizeCheck`: `"error"` (default) stops training in round 0; `"warn"` logs and
  continues. Public test datasets use `"warn"`. Real patient data must use `"error"`.
- **OQ-LR5:** Hessian sharing is accepted for v0.1 only. Revisit before any real patient
  data (options then: secure aggregation, FedAvg, a larger `minSiteRows`).
- **OQ-LR6:** retry missing sites up to `maxRoundRetries`. If still short but at least
  `minParticipants`, take the step from the responders and mark the round `partial`. Never
  reuse a gradient from an earlier round. The result then no longer equals pooled training;
  this is reported and documented. With the default `minParticipants` = K it cannot happen.
- **Class weights:** Option C. New hyperparameter `classWeight`: `null` (default),
  `"balanced"` (c_y = N / (2 N_y), global counts, as scikit-learn), or `{ "0": w₀, "1": w₁ }`.
- **Site shift check (new):** round 0 warns, but never blocks, when a site's feature mean
  is more than `siteShiftWarning` (default 3, threshold still Proposed) standard deviations
  from the other sites' combined mean, or its standard deviation is under 0.1× or over 10×
  theirs. It catches unit and coding mismatches that pass name checks. It uses only round 0
  sums, so no extra data leaves any site.

Also agreed on 2026-11-14 (previously **Proposed** in the implementation plan):

- Both methods minimize the same objective (summed log loss + L2, intercept unpenalized).
- Round 0 federated standardization and validation.
- Newton damping: reject a step that raised the loss, adjust damping by factors of 10.
- FedAvg defaults (`learningRate` 0.1, `localEpochs` 5, full batch) as starting points to tune.
- No runtime dependencies. The [dependency policy](../shared/dependencies.md) requires a
  record only to add one, so no separate record is written.
- One DCP job per site per round (Alex, 2026-11-05).

## Consequences

- New hyperparameters `classWeight`, `siteSizeCheck` and `siteShiftWarning`; `minSiteRows`
  defaults to `"auto"`. The exported model gains `training.warnings`.
- Slice arguments carry the resolved class weights. The exported model records them in
  `training.classWeights`.
- A class-weighted model's probabilities are not calibrated to the real prevalence. Docs
  must say so.
- New tests: class weights (LR-W1 to LR-W6), site size (LR-S1 to LR-S3), site shift
  (LR-H1 to LR-H6), LR-V11/LR-V12.
- Small test sites (e.g. Switzerland in Fed-Heart-Disease, 46 rows) need `"warn"` to train.
- Resolves OQ-LR1, OQ-LR2, OQ-LR4, OQ-LR5, OQ-LR6. Adds OQ-LR7 (harmonizing real hospital
  data before training).
