# Random Forest Implementation Plan

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [Summary](summary.md), [test plan](test-plan.md), [shared plan](../shared/implementation-plan.md), [proposed decision 0005](../decisions/0005-rf-site-trained-trees.md) |

> This plan covers only what is specific to random forest: the training maths, the
> hyperparameters, what a site returns, how batches combine, and the forest payload. DCP job design,
> compute groups, the worker script, the data source boundary, the site data format, failure
> handling policy, saved results, the model envelope, and dependencies are in the
> [shared implementation plan](../shared/implementation-plan.md).

## Architecture

The coordinator validates the run settings, dispatches work, and saves each valid tree batch as it arrives. DCP workers and the local test runner call the same site training function. A separate predictor loads the exported forest.

### File layout

RF code mirrors the logistic regression track in `src/lr/` and reuses the shared runners in `src/runners/`. [Shared layout](../shared/implementation-plan.md#modules-and-responsibilities)

```
src/
  index.js               exports the RF train and predict functions next to LR
  rf/
    hyperparameters.js   validates all settings before dispatch
    train.js             public entry point: validates settings, picks a runner, calls the coordinator
    coordinator.js       one job per site, saves and reuses batches, checks minParticipants, assembles the forest
    workFunction.js      site training inside one slice (self-contained, see below)
    model.js             JSON export, load, validation, and prediction, with no dependencies
test/
  rf.test.js             RF-T1 to RF-T4 (local gate), run with node --test
  fixtures/              seeded synthetic datasets
```

`workFunction.js` follows the [shared work function constraints](../shared/implementation-plan.md#work-function-constraints). In this track that means the data checks, seeded random number generator, bootstrap sampling, and tree growth all live inside it.

## Jobs and slice contents

Jobs follow the [shared job design](../shared/implementation-plan.md#discrete-jobs): **one job per site, with one slice each, all deployed together**. Training is one round, so a run is K jobs plus retries. Where a site's rows come from (inline or remote) is the shared [data source boundary](../shared/implementation-plan.md#data-flow).

| Item | Value |
|---|---|
| Slice arguments | Run ID, site ID, feature order, seed, and tree settings |
| Slice result | Run ID, site ID, a schema identifier or feature order, and the tree batch |

Keep rows and bootstrap indexes out of responses, saved batches, logs, and exports.

## Site training and aggregation

1. **Check the data.** Apply the [shared site data rules](../shared/implementation-plan.md#site-data). Random forest adds one requirement: the site needs at least `minSamplesLeaf` rows.
2. **Grow the trees.** For each tree $t = 0, \dots, T-1$, seed a random stream from the run seed, site ID, and tree index, draw a bootstrap sample, and grow the tree by recursive Gini splits until a stopping rule fires. The exact procedure is in [Training math](#training-math).
3. **Combine.** Return the $T$ trees. The coordinator accepts one valid batch per planned site, assembles batches in stable site order, and combines them by voting. It records participation in `training.participation`. The equal-vote baseline is compared with row-weighted voting before the API is settled. See [Voting](#7-voting-and-prediction).

## Training math

### Notation

| Symbol | Meaning |
|---|---|
| $s$ | A site. $C$ is the set of sites that contributed a valid batch. |
| $n_s$ | Number of rows at site $s$. Written $n$ when the site is clear. |
| $p$ | Number of features, the length of the shared feature order. |
| $x_i \in \mathbb{R}^p$, $y_i \in \{0, 1\}$ | Feature vector and label of row $i$. $x_{ij}$ is feature $j$ of row $i$. |
| $T$ | Trees per site (`nTrees`). |
| $D$ | Maximum depth (`maxDepth`). The root has depth 0. |
| $m$ | Minimum leaf size (`minSamplesLeaf`), counted in bootstrap draws. |
| $k$ | Features tried per split (from `maxFeatures`). |
| $S$ | The bootstrap draws that reach a node, counted with repetition. $N = \lvert S \rvert$. |
| $N_1$, $N_0$ | Draws in $S$ with label 1 and label 0. $N = N_0 + N_1$. |

All 32-bit arithmetic below is unsigned and modulo $2^{32}$. In JavaScript that means `>>> 0` after additions and `Math.imul` for multiplications.

### 1. Seeded random numbers

`Math.random()` cannot be seeded, so the work function contains its own small generator. No package is used, and the code must live inside `workFunction.js` (see [File layout](#file-layout)).

**Seed reduction.** The coordinator accepts any safe integer seed and reduces it to 32 bits:

$$
\sigma = \big((\text{seed} \bmod 2^{32}) + 2^{32}\big) \bmod 2^{32}
$$

**Site hash.** Hash the site ID string with 32-bit FNV-1a over its UTF-8 bytes $b_1, \dots, b_L$:

$$
h_0 = 2166136261, \qquad h_{\ell} = (h_{\ell-1} \oplus b_\ell) \cdot 16777619 \bmod 2^{32}, \qquad h = h_L
$$

**Mixing function.** `fmix32` from MurmurHash3 scrambles a 32-bit value so that nearby inputs give unrelated outputs:

```
fmix32(z):
  z ^= z >>> 16;  z = imul(z, 0x85ebca6b)
  z ^= z >>> 13;  z = imul(z, 0xc2b2ae35)
  z ^= z >>> 16
  return z >>> 0
```

**Per-tree seed.** Each tree gets its own stream:

$$
a_0 = \text{fmix32}\big(\text{fmix32}(\text{fmix32}(\sigma) \oplus h) \oplus t\big)
$$

The seed depends only on the run seed, site ID, and tree index. It does not depend on worker, runtime, slice order, or how many trees ran before. Two sites never share a stream unless their IDs collide under FNV-1a, which the coordinator checks before dispatch.

**Generator.** mulberry32 advances a 32-bit state $a$ and returns $u \in [0, 1)$:

```
next():
  a = (a + 0x6D2B79F5) >>> 0
  z = a
  z = imul(z ^ (z >>> 15), z | 1)
  z ^= z + imul(z ^ (z >>> 7), z | 61)
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296
```

An integer in $\{0, \dots, r-1\}$ is $\lfloor u \cdot r \rfloor$. The bias is at most $r / 2^{32}$, which is negligible for the row and feature counts here.

**Draw order.** Results only reproduce if draws happen in a fixed order. Each tree uses its stream in this order:

1. $n$ draws for the bootstrap sample (step 2).
2. Feature draws for each node, visiting nodes depth-first and left child before right (step 4).

### 2. Bootstrap sample

Draw $n$ row indexes with replacement: $r_i = \lfloor u_i \cdot n \rfloor$ for $i = 1, \dots, n$. Store each row's multiplicity

$$
c_j = \#\{\, i : r_i = j \,\}, \qquad \sum_j c_j = n
$$

and treat row $j$ as $c_j$ identical draws. Every count in later steps ($N$, $N_0$, $N_1$, leaf sizes) is a sum of multiplicities, not of distinct rows.

On average a bootstrap sample contains $1 - (1 - 1/n)^n \approx 1 - e^{-1} \approx 63.2\%$ of the distinct rows. The remaining out-of-bag rows are not used in v0.1. Bootstrap indexes and multiplicities never leave the work function.

### 3. Gini impurity and gain

With $q = N_1 / N$, the Gini impurity of a node is

$$
G(S) = 1 - q^2 - (1-q)^2 = 2q(1-q)
$$

It is 0 for a pure node and at most 0.5 when the classes are balanced.

A split on feature $j$ at threshold $\theta$ sends draws with $x_{ij} \le \theta$ left ($S_L$) and the rest right ($S_R$). Its gain is

$$
\Delta(j, \theta) = G(S) - \frac{N_L}{N}\, G(S_L) - \frac{N_R}{N}\, G(S_R)
$$

Gini is concave, so $\Delta \ge 0$ for every split. For computation, $N_L \, G(S_L) = 2 N_{L,0} N_{L,1} / N_L$, and the same holds on the right. That gives

$$
\Delta(j, \theta) = G(S) - \frac{2}{N}\left(\frac{N_{L,0}\, N_{L,1}}{N_L} + \frac{N_{R,0}\, N_{R,1}}{N_R}\right)
$$

**Worked example.** A node has $N = 10$ draws with $N_1 = 4$, so $G = 2 \cdot 0.4 \cdot 0.6 = 0.48$. A split sends 5 draws left, all with label 0, so $G_L = 0$. It sends 5 right, with 4 labeled 1, so $G_R = 2 \cdot 0.8 \cdot 0.2 = 0.32$. Then $\Delta = 0.48 - 0.5 \cdot 0 - 0.5 \cdot 0.32 = 0.32$.

### 4. Split search at a node

1. **Pick features.** Set $k = \max(1, \lfloor \sqrt{p} \rfloor)$ for `"sqrt"`, or the given integer. Draw $k$ distinct features with a partial Fisher–Yates shuffle of $[0, \dots, p-1]$: for $i = 0, \dots, k-1$, swap position $i$ with position $i + \lfloor u \cdot (p - i) \rfloor$, then take the first $k$. Draw a fresh set at every node.
2. **Candidate thresholds.** For each chosen feature $j$, sort the distinct values of $x_{\cdot j}$ in $S$ as $v_1 < \dots < v_r$. The candidates are the midpoints $\theta_a = v_a + (v_{a+1} - v_a)/2$ for $a = 1, \dots, r-1$. If floating-point rounding gives $\theta_a = v_{a+1}$, use $\theta_a = v_a$ so that $v_{a+1}$ still goes right. A feature with one distinct value has no candidates.
3. **Sweep.** Sort the node's rows by $x_{\cdot j}$ once. Walk through them, adding each row's multiplicity to the running counts $N_{L,0}$ and $N_{L,1}$. At each boundary between distinct values, evaluate $\Delta$ with the formula above in $O(1)$. That makes one feature at one node $O(N_{\text{rows}} \log N_{\text{rows}})$, where $N_{\text{rows}}$ is the number of distinct rows at the node.
4. **Admissible splits.** A split is admissible if $N_L \ge m$ and $N_R \ge m$.
5. **Choose.** Take the admissible split with the largest $\Delta$. Treat gains within $\varepsilon = 10^{-12}$ as equal, and break ties by lower feature index, then lower threshold. Split only if the best gain is greater than $\varepsilon$.

If none of the $k$ features has an admissible improving split, the node becomes a leaf. This differs from scikit-learn, which keeps drawing more features in that case. Matching scikit-learn exactly is not a goal.

### 5. Stopping rules and leaves

A node becomes a leaf when any of these holds:

| Rule | Condition |
|---|---|
| Pure node | $N_0 = 0$ or $N_1 = 0$ |
| Depth limit | Node depth $= D$ |
| Too small to split | $N < 2m$, so no split can leave $m$ draws on each side |
| No useful split | No admissible split has $\Delta > \varepsilon$ |

A leaf predicts

$$
\hat{y}_{\text{leaf}} = \begin{cases} 1 & N_1 > N_0 \\ 0 & \text{otherwise} \end{cases}
$$

so a leaf tie goes to class 0. If the bootstrap sample happens to contain one class only, the root is pure and the tree is a single leaf.

### 6. Tree size and cost

A binary tree of depth at most $D$ has at most $2^{D+1} - 1$ nodes. Every leaf holds at least $m$ of the $n$ draws, so a tree has at most $\lfloor n/m \rfloor$ leaves and $2\lfloor n/m \rfloor - 1$ nodes. Together:

$$
\text{nodes per tree} \le \min\!\left(2^{D+1} - 1,\; 2\left\lfloor \tfrac{n}{m} \right\rfloor - 1\right), \qquad \text{nodes per batch} \le T \cdot \text{that}
$$

With the defaults ($T = 20$, $D = 8$, $m = 5$), a tree has at most 511 nodes. For a site with $n = 1000$ rows the bound is $\min(511, 399) = 399$, or 7,980 nodes per batch. A serialized node in the [schema below](#tree-json-schema) is roughly 40–70 bytes, so a full batch is on the order of a few hundred kilobytes. RF-T10 replaces this estimate with measurements.

Each depth level sorts at most $n$ distinct rows for each of $k$ features. Training one site therefore costs about $O(T \cdot D \cdot k \cdot n \log n)$.

### 7. Voting and prediction

**Traversal.** Each tree $h_b$ maps a row to a leaf. At a split node it goes left if $x_j \le \theta$ and right otherwise. $h_b(x) \in \{0, 1\}$ is the label of the leaf it reaches.

**Equal votes (v0.1 baseline).** The forest holds $B = \lvert C \rvert \cdot T$ trees. Its score and class are

$$
\hat{s}(x) = \frac{1}{B} \sum_{b=1}^{B} h_b(x), \qquad
\hat{y}(x) = \begin{cases} 1 & \hat{s}(x) > \tfrac{1}{2} \\ 0 & \text{otherwise} \end{cases}
$$

An exact tie at $\tfrac{1}{2}$ goes to class 0. Every site contributes $T$ trees, so every site has weight $T/B = 1/\lvert C \rvert$ whatever its size. $\hat{s}(x)$ is the score used for ROC AUC. It is not a calibrated probability.

**Row-weighted alternative (tested in RF-T11).** Give site $s$ the weight $w_s = n_s / \sum_{s' \in C} n_{s'}$ and average its trees inside the site:

$$
\hat{s}_w(x) = \sum_{s \in C} w_s \cdot \frac{1}{T} \sum_{b \in \text{trees}(s)} h_b(x)
$$

The class rule and tie rule are unchanged. This needs each site to report $n_s$ in its result, which tells the coordinator how big each site is. Weigh that disclosure in OQ-RF1 alongside the accuracy results.

**Why this differs from a pooled forest.** A pooled forest bootstraps from all sites' rows together, so one tree can split on patterns that span sites. Here each tree sees one site's rows only. When sites have different distributions, the combined forest can fall short of the pooled one. RF-T9 measures that gap.

## Candidate hyperparameters

| Setting | Recommended Default | Valid Range |
|---|---|---|
| Trees per site (`nTrees`) | 20 | 1 to 100 |
| Maximum depth (`maxDepth`) | 8 | 1 to 15 |
| Minimum leaf size (`minSamplesLeaf`) | 5 | >= 2 |
| Features per split (`maxFeatures`) | "sqrt" | `"sqrt"`, or an integer from 1 to the feature count |
| Random seed (`seed`) | 42 | Any safe integer, reduced mod $2^{32}$ |

Every track also accepts the [shared settings](../shared/implementation-plan.md#hyperparameter-validation). For random forest, `minParticipants` defaults to 2 (**Proposed**, OQ-RF3) and accepts 2 to K.

The [shared validation rules](../shared/implementation-plan.md#hyperparameter-validation) apply: the coordinator checks every setting before dispatch. `maxFeatures` is bounded by the feature count from the shared feature order. Workers check only their own data, such as the row count against `minSamplesLeaf`.

Names are camelCase to match the rest of the package. They correspond to scikit-learn's `n_estimators`, `max_depth`, `min_samples_leaf`, and `max_features`. `maxFeatures: "sqrt"` matches scikit-learn's default. The other defaults are tighter than scikit-learn's (`n_estimators=100`, `max_depth=None`, `min_samples_leaf=1`) to keep result payloads small and to avoid leaves that describe a single record. Confirm them against the payload and runtime measurements in RF-T10.

## Privacy and result size

Thresholds can expose feature ranges or rare values. A leaf label can reveal information about a small group. The minimum leaf size counts bootstrap draws, which can repeat the same record. Treat trees as potentially sensitive. The data limit for v0.1 is in the shared [privacy](../shared/implementation-plan.md#privacy) section.

Batch size is bounded in [Tree size and cost](#6-tree-size-and-cost). Measure runtime and serialized bytes before setting limits.

## Serialization for inference

Export the forest in the [shared envelope](../shared/implementation-plan.md#model-output-format) (`formatVersion`, `modelType: "random-forest"`, `featureNames`, `training`) with one extra key, `trees`. A split stores a feature index, finite threshold, and two children. A leaf stores its majority class.

Go left at or below the threshold and right otherwise. Predict the majority vote. Use class `0` for voting ties and leaf ties during training. This tie rule slightly favors class `0`, so RF-T9 should report class balance alongside accuracy. The fraction of class `1` votes is an uncalibrated score. Prediction needs only JSON and numeric comparisons.

The [shared load and row checks](../shared/implementation-plan.md#model-output-format) apply (unknown version, wrong model type, wrong row length, non-finite values). Random forest adds: reject a malformed tree, meaning a child index that does not exist, a cycle, a feature index outside `featureNames`, a non-finite threshold, or a leaf prediction other than `0` or `1`.

### Tree JSON Schema

```json
{
  "formatVersion": 1,
  "modelType": "random-forest",
  "featureNames": ["age", "bmi", "smoker"],
  "training": {
    "runId": "run-2026-11-23-01",
    "hyperparameters": {
      "nTrees": 20,
      "maxDepth": 8,
      "minSamplesLeaf": 5,
      "maxFeatures": "sqrt",
      "seed": 42,
      "minParticipants": 2
    },
    "voting": "equalPerTree",
    "participation": [
      { "round": 1, "sites": ["site_01", "site_02"], "missing": ["site_03"] }
    ],
    "warnings": [],
    "trainedAt": "2026-11-23T10:00:00Z"
  },
  "trees": [
    {
      "siteId": "site_01",
      "treeIndex": 0,
      "nodes": [
        {"nodeId": 0, "feature": 1, "threshold": 25.0, "left": 1, "right": 2},
        {"nodeId": 1, "leaf": true, "prediction": 0},
        {"nodeId": 2, "leaf": true, "prediction": 1}
      ]
    }
  ]
}
```

## Failure handling

The [shared failure handling](../shared/implementation-plan.md#failure-handling) sets the policy: retries redeploy only the missing sites, the first valid result wins, and a run below `minParticipants` stops with an error and no model. This section adds what is specific to random forest. Training is one round, so there is no coordinator checkpoint. The saved unit is one site's tree batch.

**Extra batch checks.** Besides the shared checks, a batch fails if it does not hold exactly `nTrees` trees, or if any tree is malformed (see [Serialization](#serialization-for-inference)), is deeper than `maxDepth`, or uses a feature index outside the shared feature order.

**What "continue with the responders" means.** Once at least `minParticipants` sites returned valid batches, the forest holds the trees of the contributing sites. The model reports the missing sites in `training.participation`, and its tree count is the number of contributing sites times `nTrees`. Every tree has one vote, so a missing site removes its trees and its share of the vote.

**Saved batches.** A saved batch is reused under the shared [fingerprint rule](../shared/implementation-plan.md#result-persistence): the schema, settings, seed, and input snapshot must match. Rows and bootstrap indexes never appear in saved batches.

## Dependencies

Random forest adds no package dependencies beyond the [shared set](../shared/implementation-plan.md#dependencies).

- **Inference (`model.js`):** none. Prediction needs only JSON and numeric comparisons (R5).
- **Site training (`workFunction.js`):** none. Bootstrap sampling, Gini splits, and the seeded random number generator are hand-written, because the function cannot load packages on DCP workers.

Any new training dependency needs a dependency table entry, approval, and a decision record ([policy](../shared/dependencies.md)).
