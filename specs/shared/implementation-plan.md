# Shared Implementation Plan

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Skeleton |
| Last updated | TODO |
| Related | [summary.md](summary.md), [test-plan.md](test-plan.md), [dependencies.md](dependencies.md) |

> This plan covers components common to both model tracks. Track-specific details live in
> [logistic-regression/implementation-plan.md](../logistic-regression/implementation-plan.md)
> and [random-forest/implementation-plan.md](../random-forest/implementation-plan.md).

## Architecture

_What are the major components and where does each one run (user machine, DCP scheduler,
DCP worker, data host)? Add a diagram once agreed._

- TODO

## Modules and responsibilities

_Which modules are shared, and which belong to a model track? What does each own?_

| Module | Responsibility | Runs where | Owner |
|---|---|---|---|
| TODO | TODO | TODO | TODO |

### Public API

_What is the primary entry point? What does it accept and return (R4)? How does a user
choose the model type? Is the API the same shape for both tracks?_

- TODO

### Hyperparameter validation

_Where are hyperparameters validated (before job submission, on workers, both)? What
happens on invalid, missing, or unknown hyperparameters? Which are shared vs track-specific (R2)?_

- TODO

### Model output format

_What format are trained parameters returned in? Is it the same across tracks? What is
needed to load it for inference with minimal dependencies and boilerplate (R5)? Is the
format versioned?_

- TODO

## Data flow

_Trace data and model information from training start to trained output. At each step,
what moves, between which machines, and does any training data leave its host (R6)?_

1. TODO

## DCP job design

### DCP remote data

_How does a worker access its local data through DCP remote data (R7)? How do we guarantee
that the data is read locally and never uploaded (R6)?_

- TODO

### Discrete jobs

_How is training split into discrete jobs (R7)? What is one job, and what is one slice?
How many jobs per training run or per round?_

- TODO

### Compute groups

_How are workers restricted to the correct compute group? Who creates and manages the
group? How does a job target it (R10)?_

- TODO

### Worker setup script

_What does the worker script do (R10)? What does a site operator need to install or
configure? How does it point to local data? How does it join the compute group? What
platforms must it support?_

- TODO

## Training rounds or aggregation

_What round or aggregation structure is common to both tracks? What is track-specific?_

- Logistic regression: see [track plan](../logistic-regression/implementation-plan.md#training-rounds-or-aggregation)
- Random forest: see [track plan](../random-forest/implementation-plan.md#training-rounds-or-aggregation)
- TODO: shared orchestration, if any

## Failure handling

_What happens when a worker never joins, drops out mid-job, returns an error, or returns
invalid results? What is the minimum participation needed to continue (R8)?_

- TODO

### Result persistence

_Where are successful slice results saved (R9)? In what format? How does a restarted job
detect and reuse them? When are they cleaned up? Do saved results contain anything sensitive?_

- TODO

## Dependencies

_Which dependencies do shared components need? Every dependency must be added to
[dependencies.md](dependencies.md) and approved._

- TODO

## Work breakdown

| Task | Description | Requirement IDs | Owner | Status |
|---|---|---|---|---|
| TODO | TODO | TODO | TODO | Not started |

## Owners

| Area | Owner(s) |
|---|---|
| Public API | TODO |
| Hyperparameter validation | TODO |
| Model output format | TODO |
| DCP job design | TODO |
| Worker setup script | TODO |
| Result persistence | TODO |
