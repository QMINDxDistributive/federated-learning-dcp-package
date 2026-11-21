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
- **R1 (DCP Execution):** Slices distribute tree batch training across DCP worker nodes.
- **R2 (Coordinator Interface):** Clean coordinator dispatch and aggregation of site tree batches.
- **R5 (Minimal Inference Dependencies):** Serialized JSON format allows inference using only standard numeric comparisons without DCP dependencies.
- **R6 (Data Locality):** In remote data mode, raw training rows stay on site machines; workers transmit only trained tree structures.
- **R8 (Partial Participation):** Builds a valid forest from responding sites if the minimum site threshold is met.
- **R9 (Slice Recovery):** Completed, validated tree batches are saved and reused on retry.

## What needs review

Equal tree budgets give a small site the same vote as a large one. Test what that does to accuracy and ROC AUC on a shared holdout before choosing a weighting rule. The team also needs to agree on minimum participation, the DCP data path, and quality and payload limits. [Open questions](../shared/open-questions.md) · [Quality and size checks](test-plan.md#model-quality-and-payload-checks)
