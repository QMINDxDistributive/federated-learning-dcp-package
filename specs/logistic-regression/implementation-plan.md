# Logistic Regression Implementation Plan

| Field | Value |
|---|---|
| Owner | Theo, TODO: second team member (OQ1) |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [summary.md](summary.md), [test-plan.md](test-plan.md), [shared implementation plan](../shared/implementation-plan.md) |

> This plan covers only what is specific to logistic regression: the maths, the hyperparameters,
> what a site sends, how results combine, and the model payload. DCP job design, compute groups,
> the worker script, the data source boundary, the site data format, failure handling policy,
> saved results, the model envelope, and dependencies are in the
> [shared implementation plan](../shared/implementation-plan.md).
>
> Values marked **Agreed** were accepted by the track owner on 2026-11-14 and become final
> once this spec and decision records [0002](../decisions/0002-newton-default-method.md) and [0003](../decisions/0003-lr-scope-site-rules-class-weights.md) pass review. Values
> still marked **Proposed** are suggestions in this draft, not agreed decisions. Anything
> that affects the public API, the output format, or a dependency needs a decision record
> before it moves to `In review`.

## Notation

| Symbol | Meaning |
|---|---|
| K | Number of sites (hospitals) |
| k | One site |
| X_k | Site k's feature matrix, n_k × d, standardized, with a leading column of 1s if `fitIntercept` |
| y_k | Site k's labels, 0 or 1 |
| N | Total rows across participating sites, Σ n_k |
| β | Coefficient vector of length d (index 0 is the intercept) |
| σ(z) | Sigmoid, 1 / (1 + e^(−z)) |
| p_k | σ(X_k β), predicted probabilities at site k |
| λ | `l2`, the L2 penalty strength |
| D | Diagonal d × d matrix with D_00 = 0 (intercept not penalized) and 1 elsewhere |
| c_i | Class weight of row i's label (1 unless `classWeight` is set) |

**Objective** (the same for both methods, so their results can be compared):

```
L(β) = Σ_k Σ_i c_i [ −y log p − (1 − y) log(1 − p) ]  +  (λ / 2) βᵀ D β
```

This is the summed log loss plus an L2 penalty, the same objective scikit-learn's
`LogisticRegression(C = 1/λ, class_weight=...)` minimizes. That gives a ready-made centralized
baseline for tests. c_i is the [class weight](#class-weights) of row i's label; with the default
`classWeight: null`, every c_i = 1.

## Architecture

The track adds one model type to the shared package. It plugs into three shared pieces:

1. the **[runner](../shared/implementation-plan.md#public-api)**, which deploys one round to every
   site and returns the results (timeouts, retries, and saving are in the
   [shared failure handling](../shared/implementation-plan.md#failure-handling));
2. the **[checkpoint store](../shared/implementation-plan.md#result-persistence)**, which records
   coordinator state after every round (LR fields defined below);
3. the **[model output envelope](../shared/implementation-plan.md#model-output-format)** and
   `save()` / `load()` (LR payload defined below).

Newton-style and FedAvg share everything except two functions: the site step (what a
worker computes) and the coordinator update (how results become the next β). `method`
selects which pair is used.

```
user machine (coordinator)                         each site's worker
──────────────────────────                         ───────────────────
train(hyperparameters)
 ├─ validate hyperparameters (before any job)
 ├─ round 0: stats job ───────────────────────────▶ siteStats(X, y)
 │           ◀──────────────────── n_k, Σx, Σx², class counts, feature names
 ├─ compute μ, σ, N, class weights; check site sizes; validate sites agree
 └─ loop t = 1..maxRounds
     ├─ round t job (β_t) ────────────────────────▶ newtonSiteStep or fedavgSiteStep
     │           ◀──────────────────── per-method result (see below)
     ├─ newtonUpdate or fedavgUpdate → β_{t+1}
     ├─ checkpoint
     └─ stop if converged
 └─ unstandardize β → export model
```

## Modules and responsibilities

Files under `src/lr/`. The runners (`src/runners/`) are
[shared](../shared/implementation-plan.md#modules-and-responsibilities).

| Module | Responsibility | Used by (Newton / FedAvg / both) | Runs where | Owner |
|---|---|---|---|---|
| `lr/math.js` | Stable sigmoid and log loss, dot product, matrix-vector product, Cholesky solve of a small symmetric positive definite system | Both (Cholesky: Newton) | Worker and coordinator | TODO |
| `lr/hyperparameters.js` | Defaults, validation, rejection of hyperparameters that do not apply to `method` | Both | Coordinator | TODO |
| `lr/workFunction.js` | `siteStats`, `newtonSiteStep`, `fedavgSiteStep`, and the `stage` dispatch. Self-contained, as the [shared constraints](../shared/implementation-plan.md#work-function-constraints) require | Both | Worker | TODO |
| `lr/coordinator.js` | Standardization from stats, `newtonUpdate`, `fedavgUpdate`, convergence check, damping, result validation | Both | Coordinator | TODO |
| `lr/model.js` | Unstandardize coefficients, build the export object, `predictProba` | Both | Coordinator; inference anywhere | TODO |
| `lr/train.js` | The training loop: round 0, then rounds until a stop rule fires | Both | Coordinator | TODO |

The site steps are **pure** (no DCP, no I/O), so integration tests run all rounds in one process
with the local runner.

## Data flow

Per round, what moves:

| Direction | Newton-style | FedAvg |
|---|---|---|
| Coordinator → site | β_t, round number, μ, σ, class weights, method hyperparameters | β_t, N, round number, μ, σ, class weights, method hyperparameters |
| Site → coordinator | g_k (d numbers), H_k (d(d+1)/2 numbers, upper triangle), n_k, loss_k | β_k (d numbers), n_k, loss_k |
| Round 0, site → coordinator | n_k, per-feature Σx and Σx², count of each class, feature names | same |

No row-level data appears in any site result. Every site result is an aggregate over all
n_k rows. The shared [data-locality tests](../shared/test-plan.md#data-locality-checks) check this (R6).
Where a site gets its rows from (inline or remote) is the shared
[data source boundary](../shared/implementation-plan.md#data-flow); this track never sees the difference.

## Jobs and slice contents

Jobs follow the [shared job design](../shared/implementation-plan.md#discrete-jobs): one job per site
per round, deployed together, each attached to that site's compute group. This is what
logistic regression puts in them:

| Item | Value |
|---|---|
| Work function | One function. `stage` argument selects `stats`, `newton` or `fedavg` |
| Slice arguments | `{ stage, round, beta, hyperparameters, N, mean, std, classWeights }` |
| Slice result | The per-method result in [Data flow](#data-flow), plain JSON numbers |
| Jobs per training run | K × (1 stats round + rounds run + retries) |
| Expected run length | Newton about 5 to 10 rounds; FedAvg about 10 to 50 rounds (research estimates) |

Alex's order of work (work function, then aggregation, then the loop) is followed by the
[work breakdown](#work-breakdown).

## Federated standardization (round 0)

**Agreed.** Gradient methods and the L2 penalty both depend on feature scale, and every
site must use the same scale. Round 0 computes global statistics without moving rows:

1. Each site returns n_k, Σx_j and Σx_j² per feature, its class counts, and its feature names.
2. Coordinator computes N = Σ n_k, μ_j = Σ_k Σx_j / N and
   σ_j = sqrt(Σ_k Σx_j² / N − μ_j²). A feature with σ_j = 0 fails validation.
3. Coordinator applies the shared cross-site checks
   ([site data](../shared/implementation-plan.md#site-data)): same feature names in the same
   order, and both classes at every site. Failures stop training **before** any training round
   is deployed.
4. Coordinator checks each site against `minSiteRows` (see [Site size rule](#site-size-rule)).
   With `siteSizeCheck: "error"` a small site stops training here; with `"warn"` it is
   logged and training continues.
5. Coordinator runs the [site shift check](#site-shift-check), which compares each site's
   feature averages with the other sites' and warns about likely unit or coding mismatches.
   It never stops training.
6. Coordinator computes the class weights from the global class counts (see
   [Class weights](#class-weights)).
7. μ, σ and the class weights are sent with every later round. Sites standardize locally.

Round 0 doubles as the pre-deployment data validation step required by the outline.

### Site size rule

**Agreed** ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)). A site's update can reveal much of its data when the site has
fewer rows than the numbers it sends. The default, `minSiteRows: "auto"`, is therefore:

```
Newton:  max(50, d + d(d+1)/2 + 2)
FedAvg:  max(50, d + 2)
```

d counts the intercept. At 13 features (Fed-Heart-Disease, d = 14) the limit is 121 for
Newton and 50 for FedAvg. An integer overrides it.

`siteSizeCheck` decides what happens to a site below the limit: `"error"` (default) stops
training in round 0, and `"warn"` logs a warning naming the site and trains anyway. Public
test datasets set `"warn"`, so small sites such as Switzerland in Fed-Heart-Disease (46 rows)
still take part. Real patient data must use `"error"`.

### Site shift check

**Agreed** ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)); thresholds
**Proposed**. Round 0 validation catches wrong names, order and types, but not a feature
recorded in different units or coding at one site (see
[data harmonization](../shared/implementation-plan.md#data-harmonization)). Those still have matching names, so
they pass silently. The round 0 sums already give every site's per-feature mean and
standard deviation, so the coordinator can compare sites at no extra cost and with no extra
data leaving any site.

For each site k and feature j, compare the site's mean m_kj and standard deviation s_kj
with the mean μ₋ₖ and standard deviation σ₋ₖ of **all other sites combined** (computed
from their round 0 sums). Warn if either holds:

```
|m_kj − μ₋ₖ,j|  >  siteShiftWarning × σ₋ₖ,j        (average far from the other sites)
s_kj / σ₋ₖ,j   <  0.1   or   > 10                  (spread on a different scale)
```

Example: cholesterol in mg/dL at three sites (mean about 240, SD about 50) and mmol/L at a
fourth (mean about 6, SD about 1). The fourth site is about 234 away from the others' mean,
well over 3 × 50, and its SD ratio is about 0.02. Both rules fire.

- The check only **warns**. Real populations can differ a lot, so it must not block
  training. Each warning names the site, the feature, and both means, and is copied into
  the exported model's `training.warnings`.
- It needs at least 2 sites. A feature that is constant at one site gives an SD ratio of 0
  and is flagged, which usually means that site did not record it (for example, a missing
  value stored as 0).
- `siteShiftWarning` (default 3, **Proposed**) sets the first threshold. `null` turns the
  check off.

## Class weights

**Agreed** ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)). Clinical outcomes are often rare (for example, few patients
reach remission). Without weights, a model can score well by mostly predicting the common
class. `classWeight` multiplies each row's contribution to the loss, gradient and Hessian
by a weight c for its label:

| `classWeight` | c₀ (label 0) | c₁ (label 1) |
|---|---|---|
| `null` (default) | 1 | 1 |
| `"balanced"` | N / (2 N₀) | N / (2 N₁) |
| `{ "0": w₀, "1": w₁ }` | w₀ | w₁ |

N₀ and N₁ are the **global** class counts from round 0, not each site's own counts. Every
site uses the same two weights, so all sites optimize the same objective and Newton still
equals pooled training. Balancing each site by its own counts would give every site a
different objective. `"balanced"` matches scikit-learn's `class_weight="balanced"`.

With weights, predicted probabilities are no longer calibrated to the real prevalence: a
balanced model behaves as if both classes were equally common. Ranking metrics such as AUC
keep their meaning. The exported model records the weights used, so consumers know.

## Training rounds or aggregation

### Method A: Newton-style training

#### What each participant sends

At the current β_t, site k computes on its standardized data:

- gradient g_k = X_kᵀ C_k (p_k − y_k), d numbers;
- Hessian H_k = X_kᵀ C_k W_k X_k with W_k = diag(p_k (1 − p_k)), symmetric, so d(d+1)/2 numbers;
- n_k and loss_k (the summed, class-weighted log loss at β_t).

C_k = diag(c_i) holds each row's [class weight](#class-weights). It is the identity when
`classWeight` is `null`.

At 13 features plus intercept (Fed-Heart-Disease) that is 14 + 105 + 2 = 121 numbers.
H_k is a weighted covariance of the site's features, so it reveals more than a gradient
(see [Privacy](#privacy-risks-of-shared-information)).

#### How updates are aggregated

On the coordinator:

```
g = Σ_k g_k + λ D β_t
H = Σ_k H_k + λ D
solve (H + damping · I) Δ = g      (Cholesky)
β_{t+1} = β_t − Δ
```

λ is applied **once, at the coordinator**, never per site, so the result is exactly the
centralized Newton step on the pooled objective. Sites are not weighted separately: the sums
already weight each site by its row count.

**Damping (Agreed).** Start with `damping` = 0. Loss at β_{t+1} is only known in the
next round. If it went up, reject the step: return to β_t and multiply damping by 10. If it
went down, divide damping by 10 (minimum 0). A rejected step costs one round. With λ > 0 this
should be rare.

#### How convergence is determined

The coordinator stops when any of these holds:

- relative loss change |L_t − L_{t−1}| / max(1, |L_t|) < `tolerance`;
- max_j |Δ_j| < `tolerance`;
- t = `maxRounds`; the model is still returned, with `converged: false`.

Newton converges quadratically near the optimum, so 5 to 10 rounds is expected.

#### Hyperparameters

See the [combined table](#how-hyperparameters-differ-between-methods). Newton-specific: `damping`.
Newton also requires `l2` > 0. Without it, H can be singular and perfectly separable data has no finite optimum.

### Method B: FedAvg

#### What each participant sends

Site k starts from β_t and runs `localEpochs` passes of gradient descent on its local objective:

```
f_k(β) = (1 / n_k) Σ_i c_i logloss_i  +  (λ / (2N)) βᵀ D β  +  (proximalMu / 2) ‖β − β_t‖²
```

The λ/(2N) scaling makes the sample-weighted sum Σ (n_k / N) f_k equal to L(β) / N when
`proximalMu` = 0, so FedAvg and Newton optimize the same objective. `batchSize` = null means
full-batch gradient descent: deterministic, and the easiest to test. The site returns its
final β_k, n_k, and loss_k evaluated at β_t (before local training) so the coordinator can
track global loss at β_t.

`proximalMu` > 0 turns this into FedProx, a mitigation for non-IID sites. Default 0.

#### How updates are aggregated

```
β_{t+1} = Σ_{k responded} n_k β_k / Σ_{k responded} n_k
```

Weighted by sample count over the sites that responded this round. Late or missing sites
are left out of that round's average (see [Failure handling](#failure-handling)).

#### How convergence is determined

Same three rules as Newton (relative loss change, max coefficient change, `maxRounds`),
using the averaged β. With non-IID sites FedAvg can settle near, not at, the pooled
optimum. Tests measure that gap.

### How hyperparameters differ between methods

Defaults are **Agreed** ([0002](../decisions/0002-newton-default-method.md), [0003](../decisions/0003-lr-scope-site-rules-class-weights.md)). The FedAvg defaults (`learningRate`,
`localEpochs`, `batchSize`) are starting points, to be tuned once the first test runs are in.

| Hyperparameter | Applies to | Default | Valid values | Notes |
|---|---|---|---|---|
| `method` | Both | `"newton"` ([0002](../decisions/0002-newton-default-method.md)) | `"newton"`, `"fedavg"` | Selects the site step and coordinator update. Prefer `"fedavg"` when sites are smaller than the Newton payload (high d) or stricter privacy is needed |
| `l2` | Both | 1.0 | Newton: > 0. FedAvg: ≥ 0 | Penalty on standardized coefficients, intercept excluded. Equals 1/C in scikit-learn |
| `fitIntercept` | Both | `true` | boolean | |
| `standardize` | Both | `true` | boolean | If `false`, round 0 still runs for validation, but μ = 0 and σ = 1 |
| `maxRounds` | Both | Newton 25; FedAvg 100 | integer 1 to 1000 | Excludes round 0 and retries |
| `tolerance` | Both | 1e-6 | number > 0 | Used by both convergence rules |
| `minSiteRows` | Both | `"auto"` | `"auto"` or integer ≥ 1 | Checked in round 0. See [Site size rule](#site-size-rule) |
| `siteSizeCheck` | Both | `"error"` | `"error"`, `"warn"` | What happens to a site below `minSiteRows`. Public test datasets use `"warn"` |
| `classWeight` | Both | `null` | `null`, `"balanced"`, or `{ "0": w₀, "1": w₁ }` with w > 0 | See [Class weights](#class-weights) |
| `siteShiftWarning` | Both | 3 (**Proposed**) | `null` or number > 0 | Warn-only threshold, in standard deviations. See [Site shift check](#site-shift-check) |
| `damping` | Newton | 0 | number ≥ 0 | Starting value. Adjusted automatically |
| `learningRate` | FedAvg | 0.1 | number > 0 | Step size of local gradient descent |
| `localEpochs` | FedAvg | 5 | integer ≥ 1 | Local passes per round |
| `batchSize` | FedAvg | `null` (full batch) | `null` or integer ≥ 1 | |
| `proximalMu` | FedAvg | 0 | number ≥ 0 | FedProx term. 0 = plain FedAvg |

Every track also accepts the [shared settings](../shared/implementation-plan.md#hyperparameter-validation)
`minParticipants`, `roundTimeoutMs` and `maxRoundRetries`. The logistic regression default for
`minParticipants` is K (all sites), so a partial round cannot happen unless the user lowers it
(OQ10).

Rules:

- The [shared validation rules](../shared/implementation-plan.md#hyperparameter-validation) apply:
  checked on the coordinator before any job is deployed, unknown keys are an error, and a
  hyperparameter for the other method (e.g. `learningRate` with `method: "newton"`) is an error
  (LR-R3).
- Same name, same meaning: `l2` and `tolerance` mean the same thing in both methods
  because both optimize the same objective.

## Model output format

The logistic regression payload, inside the
[shared envelope](../shared/implementation-plan.md#model-output-format) (`formatVersion`,
`modelType`, `featureNames`, and the `training` keys `runId`, `hyperparameters`, `participation`,
`warnings`, `trainedAt`). Proposed LR fields:

```json
{
  "formatVersion": 1,
  "modelType": "logistic-regression",
  "featureNames": ["age", "chol", "..."],
  "intercept": -1.234,
  "coefficients": [0.021, 0.004, "..."],
  "standardization": { "mean": [54.3, 246.2], "std": [9.1, 51.8] },
  "training": {
    "runId": "run-2026-11-23-01",
    "method": "newton",
    "hyperparameters": { "...": "..." },
    "classWeights": [1, 1],
    "warnings": [],
    "rounds": 7,
    "converged": true,
    "finalLoss": 312.88,
    "participation": [
      { "round": 1, "sites": ["site-a", "site-b", "site-c"], "missing": [] }
    ],
    "trainedAt": "2026-11-23T10:00:00Z"
  }
}
```

`participation` has one entry for each of the `rounds` rounds. The example shows the first.

`intercept` and `coefficients` are on the **original feature scale**. Each coefficient is
a log-odds ratio per unit of the raw feature. Conversion from the standardized fit:
w_j = w′_j / σ_j and b = b′ − Σ_j w′_j μ_j / σ_j. `standardization` is kept for
transparency only. Inference does not need it. `training.classWeights` holds the resolved
[c₀, c₁]. If they are not [1, 1], predicted probabilities are not calibrated to the real
prevalence (see [Class weights](#class-weights)).

Reference inference with no dependencies (R5, LR-R2). The package's `predict` also applies the
[shared load and row checks](../shared/implementation-plan.md#model-output-format):

```js
function predictProba(model, x) {
  let z = model.intercept;
  for (let j = 0; j < x.length; j++) z += model.coefficients[j] * x[j];
  return 1 / (1 + Math.exp(-z));
}
```

## Failure handling

The [shared failure handling](../shared/implementation-plan.md#failure-handling) sets the policy:
retries redeploy only the missing sites, the first valid result wins, and a run below
`minParticipants` stops with an error and no model. This section adds what is specific to
logistic regression.

**Extra result checks.** Besides the shared checks, a site result also fails if it has the wrong
length for its method, or reports an n_k different from round 0.

**What "continue with the responders" means** once at least `minParticipants` sites returned:

- **FedAvg:** average the responders and continue. Record who took part. Missing sites rejoin
  next round from the new β.
- **Newton-style:** a step computed without a site is a Newton step on a different objective.
  **Agreed** ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)): retry as the shared policy
  says. If still short but at least `minParticipants`, take the step from the sites that
  responded and mark the round partial in `training.participation`. Do not reuse a missing site's
  gradient from an earlier round, because it was computed at a different β.

  **Trade-off:** after a partial round the final model **no longer equals pooled training**
  (LR-R1 holds only for runs with no partial rounds). With the default `minParticipants` = K
  this cannot happen; it happens only if the user lowers `minParticipants`. Any partial round
  is reported in `participation`, and the user docs must say so.

**Checkpoint (R9).** On top of the shared
[result persistence](../shared/implementation-plan.md#result-persistence), after each round the
coordinator checkpoints
`{ round, beta, damping, lossHistory, participation, stats (μ, σ, N), hyperparameters }`.
`train({ resumeFrom: checkpoint })` continues from the next round. A checkpoint holds only
aggregates, the same as site results. A saved site result is reused only for the same `round` and
β, which is the shared fingerprint rule applied to this track.

## Privacy risks of shared information

| Shared item | What it could reveal | Mitigation in v0 | Accepted for v0? |
|---|---|---|---|
| Round 0 sums (Σx, Σx², class counts) | Site means, variances and class balance | None needed for public test data | Yes |
| FedAvg β_k | Fitted model of one site; membership inference is possible on small sites | `minSiteRows` | Yes |
| Newton g_k | Gradient inversion when n_k is small | `minSiteRows` | Yes |
| Newton H_k | Weighted second moments of site features. If n_k ≤ d(d+1)/2, can expose much of X_k | `minSiteRows: "auto"` tied to d ([site size rule](#site-size-rule)); FedAvg for high d | Yes for v0.1, which uses public data only ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)). Revisit before any real patient data |

Secure aggregation (the coordinator sees only Σ_k, never a single site) would remove most of
these risks for both methods, because both aggregate by summing. Out of scope for v0. The
design keeps it possible: every update above is a sum or a weighted sum.

## Dependencies

**Agreed: none.** Every operation is small and simple: sigmoid, dot products,
d × d matrix sums, and one Cholesky solve per Newton round (d is tens, not thousands). We
write these in plain JavaScript with tests against known values. This keeps the work
function self-contained, avoids WASM and bundling questions, and meets the
[shared dependency policy](../shared/dependencies.md). Recorded in [0003](../decisions/0003-lr-scope-site-rules-class-weights.md).

Test-only (not shipped, still pinned): a centralized reference fit, e.g. scikit-learn run
offline to produce expected coefficients stored as fixtures. TODO: decide whether fixtures
are generated in Python or checked in as JSON only.

## Work breakdown

Ordered as Alex suggested: work function, then aggregation, then the DCP loop. The shared tasks
(local runner, DCP runner, validation rules, model envelope, partial participation and result
persistence mechanics, worker script, remote data loader) are in the
[shared work breakdown](../shared/implementation-plan.md#work-breakdown).

| # | Task | Method | Requirement IDs | Release | Owner | Status |
|---|---|---|---|---|---|---|
| 1 | `lr/math`: stable sigmoid and log loss, Cholesky solve | Both | R1 | v0.1 | TODO | Prototype |
| 2 | Reference fixtures (centralized fits) for tests | Both | LR-R1 | v0.1 | TODO | Prototype (`test/fixtures/`) |
| 3 | **Work function:** `siteStats`, `newtonSiteStep`, `fedavgSiteStep` (with class weights), `stage` dispatch | Both | R1, R6 | v0.1 | TODO | Prototype (Newton only) |
| 4 | **Aggregation:** stats → μ, σ, N, class weights and site validation (incl. site size rule and site shift check); `newtonUpdate` with damping; `fedavgUpdate`; convergence check | Both | R1, LR-R1 | v0.1 | TODO | Prototype (Newton only) |
| 5 | `lr/hyperparameters`: defaults (incl. `classWeight`, `minSiteRows: "auto"`, `siteSizeCheck`), validation, cross-method rejection | Both | R2, LR-R3 | v0.1 | TODO | Prototype |
| 6 | Unstandardize, export, `predictProba` | Both | R4, R5, LR-R2 | v0.1 | TODO | Prototype |
| 7 | Per-method partial-participation rules (Newton partial round, FedAvg average), on shared S6 | Both | R8 | With shared S3 | TODO | Not started |
| 8 | Per-round checkpoint and resume (LR fields), on shared S7 | Both | R9 | With shared S3 | TODO | Not started |
| 9 | Stretch: linear regression for continuous targets (DAPSA, PASI). One-round closed form reusing the Newton plumbing ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)) | Newton | R1 | After v0.1 | TODO | Not started |

## Owners

| Area | Owner(s) |
|---|---|
| Newton-style training | TODO |
| FedAvg | TODO |
| Shared logistic regression components | TODO |
