# 0002: Newton-style is the default logistic regression method

| Field | Value |
|---|---|
| Title | Newton-style is the default logistic regression method |
| Status | Proposed |
| Date | 2026-11-14 |
| Owners | Theo |
| Affects | [LR summary](../logistic-regression/summary.md#purpose); [LR implementation plan](../logistic-regression/implementation-plan.md#how-hyperparameters-differ-between-methods) (`method` default); [LR test plan](../logistic-regression/test-plan.md) (LR-E3, LR-Q6, pass/fail criteria); resolves OQ-LR3 |

## Context

The logistic regression track supports two interchangeable methods, Newton-style and FedAvg
(team decision, 2026-11-04). The 2026-11-04 plan was to default to FedAvg and switch to
Newton-style if round count became the bottleneck. OQ-LR3 asked which default to use.

On DCP, every round is at least one job per site and pays set-up, scheduling and retrieval
cost, so round count is the main cost of a training run. Research estimates are about 5 to
10 rounds for Newton-style and about 10 to 50 for FedAvg. Round latency has not been
measured yet (test LR-E3).

The main debug dataset (Fed-Heart-Disease) has 13 features, so a Newton update is about
121 numbers per site. v0.1 uses public or synthetic data only
([0001](0001-v0-1-send-data-with-slices.md)).

## Options considered

### Option 1: FedAvg as the default

- Description: Keep the 2026-11-04 plan. Sites train locally and the coordinator averages
  coefficients.
- Pros: Smallest payload (d + 2 numbers). Reveals less about each site. Tolerates a missing
  site well. Works when there are many features.
- Cons: Needs more rounds. Only approaches the pooled result, and is biased toward large
  sites when sites differ. Needs `learningRate` and `localEpochs` tuned.

### Option 2: Newton-style as the default

- Description: Sites send gradient and Hessian; the coordinator takes a Newton step.
- Pros: Fewest rounds. Equal to pooled training up to floating point (LR-R1). No learning
  rate to tune; damping adjusts itself.
- Cons: Payload grows with d². The Hessian reveals more about a site's data (OQ-LR5). A
  missing site breaks equality with pooled training. Requires `l2` > 0. The coordinator
  solves a d × d system each round.

## Decision

Option 2. Round count is the dominant cost on DCP, the target datasets have few features,
and the Hessian privacy concern does not apply to v0.1, which uses public data only
([0003](0003-lr-scope-site-rules-class-weights.md)). FedAvg stays fully supported and is the
recommended choice when sites are smaller than the Newton payload (high d) or when stricter
privacy is needed.

## Consequences

- `method` defaults to `"newton"`. The default `l2` (1.0) is already > 0, so the default
  configuration is valid for Newton.
- LR-E3 (time per round) and LR-Q6 (rounds to converge) now **check** this choice instead of
  making it. Revisit if FedAvg turns out faster end to end, and before any real patient data
  is used (Hessian privacy, see [0003](0003-lr-scope-site-rules-class-weights.md)).
- User docs should recommend FedAvg for high-dimensional data, such as the PsA lipidomics
  test set (292 features).
- Resolves OQ-LR3.
