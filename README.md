# Federated Learning on DCP — QMIND x Distributive

> [!IMPORTANT]
> **This repository is currently specs only.** It contains markdown specifications and
> no implementation code, dependencies, or build tooling. Do not add code until the
> specs are approved (see [Spec status](#spec-status)).

## About the project

QMIND and Distributive are building a proof-of-concept, publicly available package for
running federated learning on the Distributive Compute Platform (DCP). Training data
stays on the machines that hold it; only model information moves through DCP.

The project has two model tracks:

- **Logistic regression** — Newton-style training and FedAvg
- **Random forest**

The current phase produces markdown specs only.

GitHub org: QMind Distributed (TODO: confirm org name — see `specs/shared/open-questions.md`).

## Repository layout

```
README.md                         Project overview (this file)
CONTRIBUTING.md                   Branch, pull request, review, and decision process
specs/
  shared/                         Specs that apply to both model tracks
    summary.md                    Purpose, scope, requirements, traceability table
    implementation-plan.md        Shared architecture, API, DCP job design
    test-plan.md                  Shared test strategy
    dependencies.md               Dependency policy and approved dependency table
    open-questions.md             Unresolved questions for all tracks
  logistic-regression/            Logistic regression track (Newton-style + FedAvg)
    summary.md
    implementation-plan.md
    test-plan.md
  random-forest/                  Random forest track
    summary.md
    implementation-plan.md
    test-plan.md
  decisions/                      Decision records
    README.md                     How to record decisions
    template.md                   Decision record template
```

## Spec status

Status values: `Skeleton` → `Draft` → `In review` → `Approved`. See `CONTRIBUTING.md`.

| Spec | Owner(s) | Status |
|---|---|---|
| `specs/shared/summary.md` | Everyone | Skeleton |
| `specs/shared/implementation-plan.md` | Everyone | Skeleton |
| `specs/shared/test-plan.md` | Everyone | Skeleton |
| `specs/shared/dependencies.md` | Everyone | Skeleton |
| `specs/shared/open-questions.md` | Everyone | Skeleton |
| `specs/logistic-regression/summary.md` | Theo, TODO: second team member | Skeleton |
| `specs/logistic-regression/implementation-plan.md` | Theo, TODO: second team member | Skeleton |
| `specs/logistic-regression/test-plan.md` | Theo, TODO: second team member | Skeleton |
| `specs/random-forest/summary.md` | Nate, Mohsan, Ivan | Skeleton |
| `specs/random-forest/implementation-plan.md` | Nate, Mohsan, Ivan | Skeleton |
| `specs/random-forest/test-plan.md` | Nate, Mohsan, Ivan | Skeleton |

## Team ownership

| Area | Owners |
|---|---|
| Logistic regression (Newton-style training, FedAvg) | Theo, TODO: second team member |
| Random forest | Nate, Mohsan, Ivan |
| Shared specs | Everyone |

## How to review specs

1. Start with `specs/shared/summary.md`, including the requirements traceability table.
2. For each track, read `summary.md`, then `implementation-plan.md`, then `test-plan.md`.
3. Check that every requirement (R1–R10) maps to a spec section and to test coverage.
4. Check that nothing is invented: technical choices, versions, APIs, datasets, and
   results must be backed by a decision record or left as a TODO / open question.
5. Leave comments on the pull request. Follow the review rules in `CONTRIBUTING.md`,
   including the cross-track reviewer requirement for `specs/shared/`.
