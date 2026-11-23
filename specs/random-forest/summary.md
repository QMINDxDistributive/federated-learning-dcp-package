# Random Forest Summary

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [Implementation plan](implementation-plan.md), [test plan](test-plan.md), [shared summary](../shared/summary.md) |

> This summary covers only what is specific to random forest. The site data format, DCP, jobs,
> failure handling, saved results, the model envelope, and dependencies are in the
> [shared summary](../shared/summary.md) and
> [shared implementation plan](../shared/implementation-plan.md).

## Purpose

The Random Forest track provides an ensemble-based non-linear classifier for the federated learning package on DCP. While Logistic Regression is limited to linearly separable data, Random Forest enables privacy-preserving learning on tabular datasets with complex non-linear decision boundaries and feature interactions without requiring continuous feature scaling.

## Scope

Train one binary classifier across sites on DCP. Each site trains a batch of trees. The coordinator combines the batches into a single forest and exports versioned JSON for inference. [Proposed decision 0005](../decisions/0005-rf-site-trained-trees.md)

The coordinator sets the tree budget. Site data follows the [shared site data rules](../shared/implementation-plan.md#site-data). If a job fails, the coordinator reuses saved batches and finishes with the sites that responded, provided they meet `minParticipants` ([shared failure handling](../shared/implementation-plan.md#failure-handling)).

The v0.1 data limit is in the shared [privacy](../shared/implementation-plan.md#privacy) section. The [shared non-goals](../shared/summary.md#non-goals) apply: regression, multiclass classification, imputation, and automatic feature engineering are out of scope.

## Functional requirements

How this track addresses R1–R10 (the random forest column of the
[traceability table](../shared/summary.md#requirements-traceability)):

| ID | Where this track addresses it |
|---|---|
| R1 | [Site training and aggregation](implementation-plan.md#site-training-and-aggregation): each site trains a tree batch, and the coordinator combines the batches into one forest |
| R2 | [Hyperparameters](implementation-plan.md#candidate-hyperparameters) |
| R3 | [Jobs and slice contents](implementation-plan.md#jobs-and-slice-contents), on the [shared job design](../shared/implementation-plan.md#discrete-jobs): one round of one job per site |
| R4 | The forest in the [shared envelope](../shared/implementation-plan.md#model-output-format), with the [tree payload](implementation-plan.md#serialization-for-inference) |
| R5 | [Serialization](implementation-plan.md#serialization-for-inference): prediction needs only JSON and numeric comparisons |
| R6 | [Privacy and result size](implementation-plan.md#privacy-and-result-size): workers return only tree structures. Inline mode weakens R6 as [0001](../decisions/0001-v0-1-send-data-with-slices.md) describes |
| R7 | Deferred by [0001](../decisions/0001-v0-1-send-data-with-slices.md). Only the [loader](../shared/implementation-plan.md#data-flow) changes |
| R8 | [Failure handling](implementation-plan.md#failure-handling): a forest from the responding sites |
| R9 | [Failure handling](implementation-plan.md#failure-handling): the saved tree batch is the unit |
| R10 | None. Uses the shared worker script |

## What needs review

Equal tree budgets give a small site the same vote as a large one. Test what that does to accuracy and ROC AUC on a shared holdout before choosing a weighting rule. The team also needs to agree on the random forest minimum participation (OQ-RF3), the quality threshold (OQ-RF4), and the payload limits (OQ-RF5). Whether rows travel inline or stay on site is the shared OQ12. [Open questions](../shared/open-questions.md) · [Quality and size checks](test-plan.md#model-quality-and-payload-checks)
