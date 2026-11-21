# Random Forest Test Plan

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Draft |
| Last updated | 2026-11-20 |
| Related | [Summary](summary.md), [implementation plan](implementation-plan.md), [shared test plan](../shared/test-plan.md) |

## Functional and integration tests

| ID | Test | Requirements | Pass condition |
|---|---|---|---|
| RF-T1 | Train twice on the same seeded fixture. | R1, R2 | Identical batches with the requested count and valid splits, depth, and leaf sizes. |
| RF-T2 | Return local site results out of order. Include a tied vote. | R1, R4 | One batch per site, stable tree order, correct metadata and predictions. |
| RF-T3 | Try invalid settings, reordered features, non-finite values, invalid labels, and a single-class site. | R2, R4 | Bad settings fail before dispatch. Invalid data produce a site-specific error and no accepted batch. |
| RF-T4 | Reload the JSON and predict. Try an unknown version, malformed tree, and invalid row. | R4, R5 | Predictions match before and after export, with no inference dependencies. Invalid input fails clearly. |

## DCP, failure recovery, and data locality

| ID | Test | Requirements | Pass condition |
|---|---|---|---|
| RF-T5 | Run the same seeded fixture locally and on DCP. | R3, R4, R10 | Workers start and jobs route as intended. Each successful site returns one batch. Predictions match. |
| RF-T6 | Drop sites until exactly the minimum remain. Repeat with one fewer. | R8 | At the minimum, return the successful batches and report missing sites. Below it, fail and retain completed batches. |
| RF-T7 | Interrupt after a batch is saved. Resume with identical inputs, then with changed data or settings. Send a duplicate result. | R9 | Identical inputs reuse the saved batch. Changed inputs prevent reuse. Duplicate results count once. |
| RF-T8 | Inspect inputs, results, saved batches, logs, and exports. | R6, R7, R10 | Slice-input mode carries rows only in the input. In remote mode, workers read rows on site and no rows cross DCP. Results, saved batches, logs, and exports contain neither rows nor bootstrap indexes. |

## Model quality and payload checks

| ID | Test | Requirements | Pass condition |
|---|---|---|---|
| RF-T9 | Compare combined, pooled, and site-only forests on one holdout. Include unequal site sizes and skewed labels. Use comparable total tree budgets for combined and pooled models. | R1 | Report ROC AUC from vote fractions and accuracy from class predictions. Record split, seed, and model size. Meet the agreed quality threshold. |
| RF-T10 | Measure runtime, result bytes per site, and model size at the proposed limits. | R2, R3, R5 | Runs fit the agreed budgets. Settings outside those limits fail before dispatch. |
| RF-T11 | Compare equal-site voting against sample-size row-weighted voting on heterogeneous site distributions. | R1, R2 | Weighted voting prevents small-site majority skew and aligns with pooled baseline accuracy. |

Use synthetic fixtures for repeatable training and recovery tests. The showcase BRFSS split is a candidate for RF-T9. [Showcase plan](https://docs.google.com/document/d/181NJW-Uq353eHQrRfpFzJeYJSchxmJzSlqJQ2lfOs1c/edit?tab=t.0)

RF-T1 through RF-T4 are the local gate. Release sign-off requires agreed quality and runtime limits and passes for the selected DCP mode. Claim full R6 and R7 coverage only after verifying remote execution.
