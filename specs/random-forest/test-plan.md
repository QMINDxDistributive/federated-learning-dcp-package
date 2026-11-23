# Random Forest Test Plan

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [Summary](summary.md), [implementation plan](implementation-plan.md), [shared test plan](../shared/test-plan.md) |

> This plan lists only tests of random forest's training, trees, voting, and payloads, plus any
> random-forest condition on a shared test. Tests of behavior shared with the other track (DCP,
> validation, failure handling, saved results, data locality, the model envelope) are in the
> [shared test plan](../shared/test-plan.md) and are run here with the inputs in
> [Running the shared tests](#running-the-shared-tests).
>
> RF-T5 is the random forest run of [S-E1 and S-E3](../shared/test-plan.md#dcp-end-to-end-tests).
> RF-T7 is the random forest run of [S-C1 to S-C3](../shared/test-plan.md#failed-job-recovery-tests).
> Their IDs are kept so earlier references still resolve.

## Running the shared tests

Every [shared test](../shared/test-plan.md) runs for random forest. What this track supplies:

| Item | Value |
|---|---|
| Fixtures | Seeded synthetic datasets with unequal site sizes and skewed labels. BRFSS sample states for DCP runs |
| Result schema (S-L1, S-L4) | Run ID, site ID, feature order, and the tree batch. No other keys |
| S-E1 (RF-T5) | Each successful site returns one batch. Predictions match between the local runner and DCP |
| S-P1 | `minParticipants` defaults to 2. See also RF-T6 |
| S-C1 to S-C3 (RF-T7) | The saved unit is one site's tree batch. Identical inputs reuse it. A changed seed or setting prevents reuse |
| S-V4 to S-V8 | Each error names the site and produces no accepted batch |

## Functional and integration tests

| ID | Test | Requirements | Pass condition |
|---|---|---|---|
| RF-T1 | Train twice on the same seeded fixture. | R1, R2 | Identical batches (the RF case of [S-I2](../shared/test-plan.md#integration-tests)). Each batch holds `nTrees` trees. Every split uses a valid feature and a finite threshold. No tree is deeper than `maxDepth`. Every leaf holds at least `minSamplesLeaf` bootstrap draws. |
| RF-T2 | Include a tied vote, and trees from several sites. | R1, R4 | A tied vote predicts class `0`. Trees are ordered by site, then tree index, with correct metadata. Predictions match a hand-computed vote. |
| RF-T3 | Try random forest settings and site conditions that must fail before dispatch. | R2 | Each of these fails before dispatch with an error that names it: `nTrees`, `maxDepth`, or `minSamplesLeaf` out of range; `maxFeatures` that is not `"sqrt"` or an integer in 1 to the feature count; `minParticipants` outside 2 to K; a site with fewer rows than `minSamplesLeaf`; two site IDs that hash to the same value. |
| RF-T4 | Reload the forest JSON and predict. Try malformed trees. | R4, R5 | Predictions match before and after export. A child index that does not exist, a cycle, a feature index outside `featureNames`, a non-finite threshold, and a leaf prediction other than `0` or `1` are each rejected with a clear error. The shared [S-U1 to S-U4](../shared/test-plan.md#unit-tests) also pass. |

## Failure recovery and data locality

| ID | Test | Requirements | Pass condition |
|---|---|---|---|
| RF-T6 | Drop sites until exactly `minParticipants` remain. | R8 | The forest holds the trees of the successful sites only, and its tree count is the number of successful sites times `nTrees`. The missing sites are in `training.participation`. (The stop-below-minimum case is [S-P1](../shared/test-plan.md#partial-participation-tests).) |
| RF-T8 | Inspect results, saved batches, logs, and exports for bootstrap data. | R6 | None of them contains bootstrap indexes or multiplicities, in addition to the row checks in [S-L1 to S-L4](../shared/test-plan.md#data-locality-checks). |

## Model quality and payload checks

| ID | Test | Requirements | Pass condition |
|---|---|---|---|
| RF-T9 | Compare combined, pooled, and site-only forests on one holdout. Include unequal site sizes and skewed labels. Use comparable total tree budgets for combined and pooled models. | R1 | Report ROC AUC from vote fractions and accuracy from class predictions. Record split, seed, model size, and the predicted and actual class balance. Meet the agreed quality threshold. |
| RF-T10 | Measure runtime, result bytes per site, and model size at the proposed limits, using the [S-E2](../shared/test-plan.md#dcp-end-to-end-tests) timings. | R2, R3, R5 | Runs fit the agreed budgets. Settings outside those limits fail before dispatch. |
| RF-T11 | Compare equal-site voting against sample-size row-weighted voting on heterogeneous site distributions. | R1, R2 | Report ROC AUC and accuracy for both rules next to the pooled baseline, per site and overall, on the same holdout and seed. The results feed the weighting decision in OQ-RF1. Neither rule is assumed to win. |

The showcase BRFSS split is a candidate for RF-T9. [Showcase plan](https://docs.google.com/document/d/181NJW-Uq353eHQrRfpFzJeYJSchxmJzSlqJQ2lfOs1c/edit?tab=t.0)

## Pass/fail criteria

- **Shared tests:** every [shared test](../shared/test-plan.md#passfail-criteria) passes with the random forest inputs above.
- **Local gate:** RF-T1 through RF-T4 pass.
- **Release sign-off:** the agreed quality and runtime limits (OQ-RF4, OQ-RF5) are met in RF-T9 and RF-T10 for the selected DCP mode. Claim full R6 and R7 coverage only after S-L3 passes against real remote execution.
