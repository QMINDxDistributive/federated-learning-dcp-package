# 0001: v0.1 sends site data with slices instead of using remote data

| Field | Value |
|---|---|
| Title | v0.1 sends site data with slices instead of using remote data |
| Status | Proposed |
| Date | 2026-11-13 |
| Owners | Theo, Nate |
| Affects | [shared summary](../shared/summary.md) R6, R7; [shared implementation plan](../shared/implementation-plan.md#data-flow) (data source boundary and modes); [logistic regression plan](../logistic-regression/implementation-plan.md#data-flow); [random forest plan](../random-forest/implementation-plan.md#jobs-and-slice-contents); OQ12 |

## Context

The project outline requires that no training data is transmitted via DCP (R6) and that
training uses DCP remote data (R7). Getting remote data working needs a lot of setup up
front: each site hosts its data, workers are configured with allowed origins, and the
work function fetches from a site-internal address. Alex confirmed on 2026-11-05 that this
is possible, but the exact API was unclear.

In an email received by 2026-11-08, Alex Salgo (Distributive) recommended, with Dan's
agreement, that v0.1 skip remote data. Instead, each site's data is sent with its slices,
and development focuses on:

1. the work function that runs one federated training step;
2. the functions that aggregate those steps into the model;
3. the loop that runs these steps on DCP, which "could even wait for v0.2".

He included pseudocode: `trainModelOnDcp` loops `deployDcpTrainingStep` (one job per host,
results saved to files as they arrive via `job.on()`) and `aggregateResults` (which also
decides when training is finished). He said remote data could be easier to switch to once
everything else works, that Distributive's team can help with it significantly, and that
focusing on remote data early "might significantly slow down development on the federated
learning side."

## Options considered

### Option 1: Remote data from the first version

- Description: Implement R6 and R7 as written from the start.
- Pros: Matches the final privacy requirement. No later migration.
- Cons: Large up-front DCP and infrastructure work before any federated learning is tested.
  Distributive advises against it.

### Option 2: Send data with slices in v0.1, add remote data in a later version

- Description: In v0.1, each slice's input carries that site's rows. Build and test the work
  function and aggregation first, then the DCP loop. Add remote data later with
  Distributive's help.
- Pros: Recommended by Distributive. Lets the team focus on the federated learning maths,
  which is the novel part. Work functions and aggregation can be tested without DCP.
- Cons: v0.1 does not meet R6 or R7. Row-level data passes through DCP, so v0.1 must only
  use public or synthetic data. Needs a clean boundary so the later switch is cheap.

## Decision

Option 2 (Proposed, pending team approval). v0.1 sends each site's data with its slices.
R6 and R7 still apply to the final package, but are deferred to the release that adds remote
data (TODO: v0.2 or later, to agree with Alex).

## Consequences

- **R6 for v0.1** becomes: training data appears only in slice inputs. It never appears in
  slice results, checkpoints, logs, or the exported model. Data-locality tests check this.
- **R7** is deferred. Each track keeps data loading behind one small loader so that
  switching to remote data changes only that loader.
- **v0.1 uses public or synthetic data only.** Real patient data must wait for remote data.
- **Development order:** work function, then aggregation, then the DCP loop (which may slip
  to v0.2). A local runner that calls the work function in-process is the main test harness
  for v0.1.
- **Slice placement does not affect correctness in v0.1**, because the data travels with the
  slice. One job per host (as in Alex's pseudocode) is still used, so the structure stays the
  same when remote data arrives.
- Resolves OQ12 once accepted. The shared summary's R6 and R7 rows need a note linking here.
