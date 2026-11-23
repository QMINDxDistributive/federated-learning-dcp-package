# Random Forest Summary

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Draft |
| Last updated | 2026-11-20 |
| Related | [Implementation plan](implementation-plan.md), [test plan](test-plan.md), [shared requirements](../shared/summary.md#requirements-traceability) |

## Purpose

The Random Forest track provides an ensemble-based non-linear classifier for the federated learning package on DCP. While Logistic Regression is limited to linearly separable data, Random Forest enables privacy-preserving learning on tabular datasets with complex non-linear decision boundaries and feature interactions without requiring continuous feature scaling.

## Scope

Train one binary classifier across sites on DCP. Each site trains a batch of trees. The coordinator combines the batches into a single forest and exports versioned JSON for inference. [Proposed decision 0005](../decisions/0005-rf-site-trained-trees.md)

Site operators supply rows with the same ordered numeric features and labels coded `0` or `1`. The coordinator sets the tree budget and minimum site count. If a job fails, the coordinator can reuse saved batches and finish with the sites that responded, provided they meet the minimum.

The proof of concept uses public or synthetic data. Regression, multiclass classification, imputation, and automatic feature engineering are outside its scope.

## Functional requirements

This track maps directly to the shared requirements:
- **R1 (Federated training):** Each site trains a tree batch on its own rows, and the coordinator combines the batches into one forest.
- **R2 (Hyperparameters):** The coordinator accepts tree count, depth, leaf size, features per split, seed, and minimum site count, and validates them before dispatch.
- **R3 (DCP):** One DCP job runs one slice per site.
- **R4 (Primary API):** The API takes hyperparameters and returns the trained forest as versioned JSON.
- **R5 (Minimal inference dependencies):** Inference needs only JSON and numeric comparisons, with no DCP or package dependencies.
- **R6 (Data locality):** In remote data mode, raw rows stay on site machines and workers return only tree structures. Deferred in slice-input mode.
- **R7 (Remote data and discrete jobs):** Remote data mode loads rows on the site's worker. Deferred in slice-input mode.
- **R8 (Partial participation):** Builds a valid forest from responding sites if the minimum site threshold is met.
- **R9 (Slice recovery):** Completed, validated tree batches are saved and reused on retry.
- **R10 (Worker script):** Site workers join the correct compute group and host local data in remote data mode.

## What needs review

Equal tree budgets give a small site the same vote as a large one. Test what that does to accuracy and ROC AUC on a shared holdout before choosing a weighting rule. The team also needs to agree on minimum participation, the DCP data path, and quality and payload limits. [Open questions](../shared/open-questions.md) · [Quality and size checks](test-plan.md#model-quality-and-payload-checks)
