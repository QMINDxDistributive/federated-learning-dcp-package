# Logistic Regression Test Plan

| Field | Value |
|---|---|
| Owner | Theo, TODO: second team member (OQ1) |
| Status | Draft |
| Last updated | 2026-11-14 |
| Related | [summary.md](summary.md), [implementation-plan.md](implementation-plan.md), [shared test plan](../shared/test-plan.md) |

> Each test references the requirement IDs it covers and the method it applies to.
> Thresholds marked **Proposed** need agreement.

Test case format: `ID | method | description | requirement IDs | expected result | status`

## Test datasets

From Mohsan's dataset candidates sheet (Drive › Research › Datasets, 2026-11-08), using
only what fits binary logistic regression. Dataset choice is still OQ5 (shared), so this
list is the LR track's proposal. The arthritis and psoriasis sets are included so tests see
data shaped like the real use case (small sites, rare outcomes, many features), even though
the package itself does not depend on the disease.

| Dataset | Use | Sites | Target |
|---|---|---|---|
| Synthetic (generated in tests, fixed seed) | Unit and exactness tests | Any split | Known β |
| FLamby Fed-Heart-Disease | Main debug set; published federated baseline | 4 natural hospitals (303 / 261 / 46 / 130) | Heart disease, binary |
| UCI Dermatology | Disease-flavoured debug | 3 to 5 by Dirichlet label skew (α = 0.5) | Psoriasis vs rest (binarized from 6 classes) |
| Diabetes 130-US Hospitals | Scale, bundled in repo | 3 to 6 by admission source or specialty | 30-day readmission, binary |
| NHANES (arthritis type 2011–2018; psoriasis 2003–06, 2009–14) | Arthritis-flavoured, large; rare-outcome case | 4 to 5 by survey cycle | Self-reported RA or psoriasis, binary (psoriasis about 3% positive). PsA alone is too rare. Fetch-and-preprocess script, not bundled |
| Zenodo RA bDMARD response | Smoke test shaped like the real question (biologic response) | 1 to 2 (154 patients, too small to split further) | Remission at 6 months (EULAR, DAS28-ESR), binary. Licence to confirm before use |
| PsA Clinical Lipidomics (Mendeley) | High-dimensional case: more features than patients | 2 to 3 batch groups (about 25 to 50 subjects each) | PsA vs healthy control, binary. 292 features, so every site is smaller than either method's payload (Newton about 43,000 numbers, FedAvg 295). Check batch vs label confounding first. Authors say it is not for biological conclusions |

The Switzerland site in Fed-Heart-Disease (46 rows) is the natural small-site case for
`minSiteRows` and privacy tests. It is below the Newton `minSiteRows: "auto"` limit (121 at
d = 14), so runs on public test data set `siteSizeCheck: "warn"`.

## Tolerances

Floating-point results differ between devices, so no test compares floats exactly.
**Proposed:** coefficient comparisons use max absolute difference; exactness tests 1e-8,
Newton vs centralized 1e-6, FedAvg vs centralized reported, with a pass threshold set per
dataset after the first runs.

## Unit tests

| ID | Method | Description | Req | Expected |
|---|---|---|---|---|
| LR-U1 | Both | Sigmoid stays finite and correct for z = ±1000, 0, ±1e-10 | R1 | No NaN/Infinity. σ(0) = 0.5 |
| LR-U2 | Both | Log loss is stable when p rounds to 0 or 1 | R1 | Finite value |
| LR-U3 | Newton | Cholesky solve matches a known 3×3 and a random 20×20 SPD system | R1 | Residual < 1e-10 |
| LR-U4 | Newton | Cholesky on a non-SPD matrix throws a clear error | R1 | Error names the problem |
| LR-U5 | Both | `siteStats` returns correct n, Σx, Σx², class counts on a hand-made 4-row table | R6 | Exact |
| LR-U6 | Both | Coordinator μ, σ from per-site stats equal μ, σ of the pooled table | R1 | Within 1e-12 |
| LR-U7 | Both | Unstandardize: predictions with exported raw-scale coefficients equal predictions with standardized coefficients on standardized inputs | R5 | Within 1e-12 |
| LR-U8 | Both | Exported JSON round-trips through `save` / `load` and predicts identically | R5 | Identical output |
| LR-U9 | Both | `predictProba` snippet from the spec, copied into a file with no imports, matches the package | R5, LR-R2 | Within 1e-12 |

## Integration tests

Run every round in one process with a local runner that calls the same work function
without DCP (see [implementation plan](implementation-plan.md#modules-and-responsibilities)).

| ID | Method | Description | Req | Expected |
|---|---|---|---|---|
| LR-I1 | Both | Full run on a synthetic 3-site split converges | R1, R4 | `converged: true`, model returned |
| LR-I2 | Both | Same seed and inputs give the same model on the same machine | R1 | Identical |
| LR-I3 | Both | Resume from a checkpoint at round 3 gives the same final model as an uninterrupted run | R9 | Within 1e-12 |
| LR-I4 | Both | Round 0 rejects sites whose feature names or order differ | R6 | Error before round 1, names the site |

## DCP end-to-end tests

These need the DCP loop (task 8 in the [work breakdown](implementation-plan.md#work-breakdown)), which may arrive in v0.2 (OQ13). Until then, the integration tests with the local runner are the main check.

| ID | Method | Description | Req | Expected |
|---|---|---|---|---|
| LR-E1 | Newton | Fed-Heart-Disease, 4 workers each acting as one site, on real DCP | R3, R7 | Matches local runner result within tolerance |
| LR-E2 | FedAvg | Same as LR-E1 | R3, R7 | Matches local runner result within tolerance |
| LR-E3 | Both | Record time per round (deploy to last result) for 1, 4 and 8 sites | R3 | Numbers recorded. Feeds `roundTimeoutMs` and the [0002](../decisions/0002-newton-default-method.md) review |
| LR-E4 | Both | Each site's job runs only on that site's compute group | R7, R10 | Worker logs show correct placement. Needed once remote data is added ([0001](../decisions/0001-v0-1-send-data-with-slices.md)); informational in v0.1. Depends on OQ9 |

LR-E3 is the most important early measurement: it checks the Newton-style default
([0002](../decisions/0002-newton-default-method.md)). If FedAvg turns out faster end to end, revisit that decision.

## Invalid-input tests

All must fail **before any training round is deployed**, with an error naming the problem.

| ID | Method | Description | Req |
|---|---|---|---|
| LR-V1 | Both | Unknown hyperparameter key | R2, LR-R3 |
| LR-V2 | Newton | `learningRate` passed with `method: "newton"` | LR-R3 |
| LR-V3 | FedAvg | `damping` passed with `method: "fedavg"` | LR-R3 |
| LR-V4 | Newton | `l2: 0` with Newton | R2 |
| LR-V5 | Both | Out-of-range values: negative `l2`, `maxRounds: 0`, `minParticipants` > K | R2 |
| LR-V6 | Both | Non-numeric feature value at one site | R6 |
| LR-V7 | Both | Missing value at one site | R6 |
| LR-V8 | Both | Label not in {0, 1} | R6 |
| LR-V9 | Both | A site with only one class | R6 |
| LR-V10 | Both | Constant feature across all sites (σ = 0) | R6 |
| LR-V11 | Both | Site below `minSiteRows` with `siteSizeCheck: "error"` (the default) | R6 |
| LR-V12 | Both | `classWeight` with an unknown string, a missing class, or a weight ≤ 0 | R2, LR-R3 |

## Partial-participation tests

Use a local runner that can drop a chosen site in a chosen round.

| ID | Method | Description | Req | Expected |
|---|---|---|---|---|
| LR-P1 | FedAvg | One of 4 sites missing in round 2 only | R8 | Completes. Round 2 averages 3 sites. Participation recorded |
| LR-P2 | FedAvg | One site missing for every round | R8 | Completes. Result equals training on 3 sites |
| LR-P3 | Newton | One site missing in round 2, returns after a retry | R8 | Result identical to a run with no dropout |
| LR-P4 | Newton | One site missing in round 2 after all retries, `minParticipants` = 3 | R8 | Completes. Round 2 marked `partial`. Final gap to pooled reported |
| LR-P5 | Both | Responders fall below `minParticipants` | R8, R9 | Stops with an error naming missing sites. Checkpoint saved. No model |
| LR-P6 | Both | Site returns NaN, wrong length, or a changed n_k | R8 | Treated as a failed site, logged |

## Failed-job recovery tests

| ID | Method | Description | Req | Expected |
|---|---|---|---|---|
| LR-C1 | Both | Kill the run after 2 of 4 sites returned in round 5, then resume | R9 | Only the 2 missing sites are redeployed for round 5 |
| LR-C2 | Both | Resume with different hyperparameters than the checkpoint | R9 | Rejected with a clear error |
| LR-C3 | Both | Resume from a checkpoint written after the final round | R9 | Returns the model with no new jobs |

## Model-quality checks

Baseline: centralized logistic regression on the pooled data with the same λ (scikit-learn
`LogisticRegression(C = 1/λ)` on standardized features, or our own centralized Newton).

| ID | Method | Description | Req | Pass (Proposed) |
|---|---|---|---|---|
| LR-Q1 | Newton | Synthetic IID and non-IID splits: federated vs centralized coefficients | LR-R1 | Max abs difference < 1e-6 |
| LR-Q2 | Newton | Fed-Heart-Disease, 4 natural sites, vs centralized | LR-R1 | Max abs difference < 1e-6 |
| LR-Q3 | FedAvg | Fed-Heart-Disease vs centralized | R1 | AUC within 0.01 of centralized. Coefficient gap reported |
| LR-Q4 | FedAvg | Dermatology with label skew α = 0.5 vs α = 100 (near IID) | R1 | Report gap growth with skew. Check whether `proximalMu` > 0 narrows it |
| LR-Q5 | Both | Diabetes 130 split by admission source: AUC and log loss per site and overall, with 95% bootstrap intervals | R1 | Reported. Federated AUC not below best single-site model |
| LR-Q6 | Both | Rounds to converge for each method on each dataset | R1 | Reported. Checks [0002](../decisions/0002-newton-default-method.md) |
| LR-Q7 | Both | Compare against the FLamby published Fed-Heart-Disease result | R1 | Within the FLamby reported range. TODO: record the exact figure and metric |
| LR-Q8 | Both | NHANES split by survey cycle (rare outcome), with and without `classWeight: "balanced"` | R1 | Reported: AUC, positive-class recall, per-cycle metrics |
| LR-Q9 | Both | Zenodo RA remission, 1 site vs 2 sites | R1 | Runs end to end. Newton 2-site result equals the 1-site result within 1e-6 |
| LR-Q10 | Both | PsA Lipidomics batch split with `siteSizeCheck: "warn"` | R1 | Reported: rounds, payload size and time per round for each method |

Report per-site metrics and confidence intervals, not a single accuracy number (from the
clinical research: regulators expect this).

## Data-locality checks

| ID | Method | Description | Req | Expected |
|---|---|---|---|---|
| LR-L1 | Both | Every site result validates against a strict schema: only the keys and lengths listed in the [data flow table](implementation-plan.md#data-flow) | R6 | No extra keys. Lengths depend only on d |
| LR-L2 | Both | Result size is independent of n_k (run with n_k = 50 and 5000) | R6 | Same byte size |
| LR-L3 | Both | Checkpoints contain only aggregates | R6, R9 | Schema check passes |
| LR-L4 | Both | With inline data (v0.1, [0001](../decisions/0001-v0-1-send-data-with-slices.md)), confirm the only row-level data is the slice input, and none appears in results, checkpoints, logs or the exported model | R6 | Grep for known row values finds none outside input |

## Newton-style training tests

- [ ] LR-N1: g_k and H_k on a 5-row hand-computed example match expected values (exact to 1e-12)
- [ ] LR-N2: Σ_k g_k and Σ_k H_k over any split equal g and H on the pooled data (aggregation is exact)
- [ ] LR-N3: λ is added once at the coordinator. Splitting the same data into 1, 2 or 10 sites gives the same β
- [ ] LR-N4: The intercept is not penalized
- [ ] LR-N5: Converges in ≤ 10 rounds on Fed-Heart-Disease with default hyperparameters (Proposed)
- [ ] LR-N6: Damping: a forced bad step (e.g. a huge starting β) is rejected and damping increases; training still converges
- [ ] LR-N7: Reaching `maxRounds` returns a model with `converged: false`
- [ ] LR-N8: Near-separable data with small λ stays finite

## FedAvg tests

- [ ] LR-F1: One round with `localEpochs` = 1, full batch, equals one gradient descent step on the pooled objective (FedSGD equivalence)
- [ ] LR-F2: Weighted average uses n_k. Sites of 10 and 1000 rows weight 10:1000
- [ ] LR-F3: Local objective uses λ/(2N), so the weighted objective equals L(β)/N (checked numerically)
- [ ] LR-F4: `proximalMu` = 0 gives identical results to code without the proximal term
- [ ] LR-F5: Mini-batch mode with a fixed seed is reproducible
- [ ] LR-F6: Unequal site sizes (Fed-Heart-Disease: 303 vs 46) converge, and the gap to pooled is reported
- [ ] LR-F7: Reaching `maxRounds` returns a model with `converged: false`

## Class weight tests

- [ ] LR-W1: `classWeight: null` and `{ "0": 1, "1": 1 }` give identical models
- [ ] LR-W2: Integer weights equal row duplication: weight 2 on class 1 gives the same β as duplicating every class-1 row (Newton, within 1e-8)
- [ ] LR-W3: `"balanced"` uses global class counts from round 0. Newton gives the same β for 1, 2 or 10 sites, including splits where class balance differs by site
- [ ] LR-W4: `"balanced"` matches scikit-learn `class_weight="balanced"` on the pooled data (Newton, within 1e-6)
- [ ] LR-W5: FedAvg with `"balanced"` sends the same global weights to every site (checked in slice arguments)
- [ ] LR-W6: The exported model records `training.classWeights`

## Site size tests

- [ ] LR-S1: `minSiteRows: "auto"` resolves to 121 (Newton) and 50 (FedAvg) at d = 14
- [ ] LR-S2: Fed-Heart-Disease with `siteSizeCheck: "warn"`: Switzerland (46 rows) logs a warning naming the site, and training completes
- [ ] LR-S3: PsA Lipidomics with the default `siteSizeCheck: "error"` stops in round 0 for both methods, with an error naming each small site and the limit

## Site shift tests

- [ ] LR-H1: Synthetic 4-site split with one feature converted from mg/dL to mmol/L (÷ 38.67) at one site: round 0 warns, naming that site, the feature, and both means. Training still runs
- [ ] LR-H2: IID synthetic split: no site shift warnings
- [ ] LR-H3: A feature that is constant at one site (e.g. all 0) is flagged at that site
- [ ] LR-H4: `siteShiftWarning: null` turns the check off; the exported model's `training.warnings` is empty
- [ ] LR-H5: Warnings raised in round 0 appear in the exported model's `training.warnings`
- [ ] LR-H6: Fed-Heart-Disease (4 natural sites): record which warnings fire, if any. Informational, used to tune the default threshold

## Pass/fail criteria

**Proposed.** The track is done when:

- **Both methods:** all unit, integration, invalid-input, partial-participation, recovery,
  data-locality, class weight, site size and site shift tests pass; at least one DCP end-to-end run per method passes (LR-E1, LR-E2);
  LR-E3 timings are recorded.
- **Newton-style:** LR-Q1 and LR-Q2 pass (equal to pooled within 1e-6).
- **FedAvg:** LR-Q3 passes, and the LR-Q4 and LR-Q6 results are written up to confirm or
  revisit the Newton-style default ([0002](../decisions/0002-newton-default-method.md)).
