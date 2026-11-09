# Random Forest Implementation Plan

| Field | Value |
|---|---|
| Owner | Nate, Mohsan, Ivan |
| Status | Skeleton |
| Last updated | TODO |
| Related | [summary.md](summary.md), [test-plan.md](test-plan.md), [shared implementation plan](../shared/implementation-plan.md) |

## Architecture

_How does this track plug into the shared architecture? Where are trees built, and where
is the forest assembled?_

- TODO

## Modules and responsibilities

| Module | Responsibility | Runs where | Owner |
|---|---|---|---|
| TODO | TODO | TODO | TODO |

## Data flow

_What moves between the coordinator and workers during training? Confirm no training data
leaves a worker (R6)._

- TODO

## DCP job design

_How does training map onto DCP discrete jobs and slices? One slice per site, per tree,
per tree level? How are remote data and compute groups used? See
[shared DCP job design](../shared/implementation-plan.md#dcp-job-design)._

- TODO

## Training rounds or aggregation

### How trees or split statistics are trained and combined

_Do sites train whole trees locally and the coordinator combines them, or do sites
compute split statistics that the coordinator uses to grow shared trees? Is there more
than one round? Record the chosen approach as a decision._

- TODO

### What each participant sends

_What exactly does a worker return (trees, split candidates, histograms, counts)? How big
is it? Does it depend on the number of rows, features, or classes?_

- TODO

### How heterogeneous sites are handled

_How do we handle sites with different sample sizes, label distributions, feature ranges,
or missing features? Are site contributions weighted? Must all sites share a schema?_

- TODO

### Privacy risks of shared information

_What could someone learn about a site's data from what it sends (e.g. leaf values, split
thresholds, counts in small leaves)? What mitigations are in scope for the proof of
concept? What risks are accepted and documented?_

| Shared item | What it could reveal | Mitigation | Accepted? |
|---|---|---|---|
| TODO | TODO | TODO | TODO |

### Hyperparameters

| Hyperparameter | Description | Default | Valid values | Validated where |
|---|---|---|---|---|
| TODO | TODO | TODO | TODO | TODO |

## Serialization for inference

_How is the final forest serialized? Is it the shared [model output format](../shared/implementation-plan.md#model-output-format)?
What is needed to load it and predict with minimal dependencies and boilerplate (R5)?
Is the format versioned? How large can it get?_

- TODO

## Failure handling

_What happens if a site drops out (R8)? Can the forest be built from the sites that
finished? How are completed slice results (e.g. finished trees or statistics) reused
after a failure (R9)?_

- TODO

## Dependencies

_What does this track need beyond shared dependencies? Add every dependency to
[dependencies.md](../shared/dependencies.md)._

- TODO

## Work breakdown

| Task | Description | Requirement IDs | Owner | Status |
|---|---|---|---|---|
| TODO | TODO | TODO | TODO | Not started |

## Owners

| Area | Owner(s) |
|---|---|
| Tree / split-statistic training | TODO |
| Aggregation / forest assembly | TODO |
| Heterogeneous sites | TODO |
| Privacy analysis | TODO |
| Serialization for inference | TODO |
