# Random Forest Implementation Plan

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Draft |
| Last updated | 2026-11-20 |
| Related | [Summary](summary.md), [test plan](test-plan.md), [shared plan](../shared/implementation-plan.md), [proposed decision 0005](../decisions/0005-rf-site-trained-trees.md) |

## Architecture

The coordinator validates the run settings, dispatches work, and saves each valid tree batch as it arrives. DCP workers and the local test runner call the same site training function. A separate predictor loads the exported forest.

## Data flow and DCP job design

Send one job with one slice per site. Each slice gets the run ID, site ID, feature order, seed, and tree settings. Jobs can run in parallel. A loader supplies the rows.

- **Slice input.** Under the proposed v0.1 design, public or synthetic rows travel in the slice. Full R6 and R7 are deferred in this mode. [Proposed decision 0001](https://github.com/QMINDxDistributive/federated-learning-dcp-package/blob/bb934da0d2c547e9665f2a83fbde580bdc1888ed/specs/decisions/0001-v0-1-send-data-with-slices.md)
- **Remote data.** Route the job to the site's worker and verify that it loads rows on the site machine. Worker setup and routing follow the shared DCP decisions.

The response contains run and site IDs, a schema identifier or feature order, and the tree batch. Keep rows and bootstrap indexes out of responses, saved batches, logs, and exports.

## Site training and aggregation

1. Check feature names and order, finite numeric values, and binary labels. A site needs both classes and at least as many rows as the minimum leaf size. Sites agree on units and category encoding before training.
2. For each tree, sample the site's row count with replacement. Derive the random stream from the run seed, site ID, and tree index. At each node, sample candidate features and choose the split with the greatest Gini gain. Stop at a pure node, the depth limit, or when no improving split meets the minimum leaf size. Break split ties deterministically. A single-class bootstrap sample produces one leaf.
3. Return the requested number of trees. Accept one valid batch per planned site and assemble batches in stable site order. Each tree gets one vote. Record contributing and missing sites. Compare this equal-site baseline with row-weighted voting before settling the API.

### Candidate hyperparameters

| Setting | Recommended Default | Valid Range | Where Validated |
|---|---|---|---|
| Trees per site (`n_trees`) | 20 | 1 to 100 | Coordinator |
| Maximum depth (`max_depth`) | 8 | 1 to 15 | Coordinator |
| Minimum leaf size (`min_samples_leaf`) | 5 | >= 2 | Worker |
| Features per split (`max_features`) | "sqrt" | 1 to feature count | Worker |
| Random seed (`seed`) | 42 | Any integer | Coordinator |
| Minimum successful sites | 2 | 2 to planned sites | Coordinator |

Check settings before dispatch. Defaults are selected to align with scikit-learn conventions and payload constraints.

### Privacy and result size

Thresholds can expose feature ranges or rare values. A leaf label can reveal information about a small group. The minimum leaf size counts bootstrap draws, which can repeat the same record. Treat trees as potentially sensitive and use public or synthetic data.

At depth `D` with the root at zero, a batch of `T` trees has at most `T × (2^(D+1) - 1)` nodes. Measure runtime and serialized bytes before setting limits.

## Serialization for inference

Export versioned JSON with ordered feature names, tree roots, and training metadata. A split stores a feature index, finite threshold, and two children. A leaf stores its majority class.

Go left at or below the threshold and right otherwise. Predict the majority vote. Use class `0` for voting ties and leaf ties during training. The fraction of class `1` votes is an uncalibrated score. Reject unknown versions, malformed trees, and rows with the wrong length or non-finite values. Prediction needs only JSON and numeric comparisons.

### Tree JSON Schema

```json
{
  "version": "1.0",
  "n_features": 3,
  "feature_names": ["age", "bmi", "smoker"],
  "trees": [
    {
      "site_id": "site_01",
      "tree_index": 0,
      "nodes": [
        {"node_id": 0, "feature": 1, "threshold": 25.0, "left": 1, "right": 2},
        {"node_id": 1, "leaf": true, "prediction": 0},
        {"node_id": 2, "leaf": true, "prediction": 1}
      ]
    }
  ]
}
```

## Failure handling

Retry failed or timed-out jobs under the shared policy. Save one validated batch per run and site. Reuse it only if the schema, settings, seed, and input snapshot match. Rerun the site if the snapshot cannot be verified. Ignore duplicate results.

After retries, return a forest only if enough sites succeeded. Report missing sites and the tree count. Below the minimum, fail and retain completed batches for retry. Timeout, storage, and retention are still open. [Shared open questions](../shared/open-questions.md)

## Dependencies

Inference has no package dependencies. Any training dependency needs approval. [Dependency policy](../shared/dependencies.md)
