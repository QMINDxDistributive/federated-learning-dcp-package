# Federated Learning on DCP — QMIND x Distributive

> [!IMPORTANT]
> **The specs are the source of truth, and they are still drafts.** The repository also holds a
> **logistic regression prototype** (`src/`, `test/`, `tools/`, `demo/`, `fl-agent.js`) that tested
> the specs on DCP. Random forest has specs only. Where the prototype does not match a spec yet,
> the spec says so (see the [shared implementation plan](specs/shared/implementation-plan.md)).
> TODO: confirm the team's rule for adding code before the specs are approved
> (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## About the project

QMIND and Distributive are building a proof-of-concept, publicly available package for
running federated learning on the Distributive Compute Platform (DCP). Training data
stays on the machines that hold it; only model information moves through DCP.

The project has two model tracks:

- **Logistic regression** — Newton-style training and FedAvg
- **Random forest**

The current phase is the specs, plus the logistic regression prototype that checks them.

GitHub org: QMind Distributed (TODO: confirm org name — see `specs/shared/open-questions.md`).

## Showcase demo and compute groups

The logistic regression showcase demo lives in [demo/](demo/README.md). Laptops join
from a link or QR code, and their rows stay on each laptop. A real DCP run needs **one DCP
compute group for each laptop that joins**, created in the DCP portal and listed in
`demo/devices.json`. Without groups, only Simulation mode can train. The reason is in
[demo/README.md](demo/README.md#why-one-compute-group-per-laptop), and the open questions
for Distributive are in [questions-for-alex.md](specs/shared/questions-for-alex.md). What each DCP
key is and where to put it: [demo/dcp-credentials.md](demo/dcp-credentials.md).

## Repository layout

```
README.md                         Project overview (this file)
CONTRIBUTING.md                   Branch, pull request, review, and decision process
package.json                      Pinned dependencies and npm scripts (prototype)
specs/
  shared/                         Everything that applies to both model tracks
    summary.md                    Purpose, users, scope, requirements, traceability, releases
    implementation-plan.md        Architecture, API, site data, model envelope, DCP jobs,
                                  compute groups, worker script, failure handling, saved results
    test-plan.md                  Tests run for every track (DCP, validation, recovery, locality)
    dependencies.md               Dependency policy and approved dependency table
    open-questions.md             Unresolved questions for all tracks
    questions-for-alex.md         Questions to raise with Distributive (Alex)
  logistic-regression/            Only what is specific to logistic regression
    summary.md
    implementation-plan.md
    test-plan.md
  random-forest/                  Only what is specific to random forest
    summary.md
    implementation-plan.md
    test-plan.md
  decisions/                      Decision records
    README.md                     How to record decisions, and the index
    template.md                   Decision record template
src/                              Prototype: shared runners (runners/) and logistic regression (lr/)
test/                             Prototype tests and fixtures
tools/                            Data preparation and reference scripts (Python, not shipped)
demo/                             Showcase demo: coordinator, dashboard, join page
fl-agent.js                       Standalone site agent (decision 0004)
```

**Where a spec rule goes.** If it applies to both tracks, it lives in `specs/shared/`. A track
spec holds only what is specific to its model and links to the shared spec for the rest.

## Spec status

Status values: `Skeleton` → `Draft` → `In review` → `Approved`. See `CONTRIBUTING.md`.

| Spec | Owner(s) | Status |
|---|---|---|
| `specs/shared/summary.md` | Everyone | Draft |
| `specs/shared/implementation-plan.md` | Everyone | Draft |
| `specs/shared/test-plan.md` | Everyone | Draft |
| `specs/shared/dependencies.md` | Everyone | Skeleton |
| `specs/shared/open-questions.md` | Everyone | Skeleton |
| `specs/logistic-regression/summary.md` | Theo, TODO: second team member | Draft |
| `specs/logistic-regression/implementation-plan.md` | Theo, TODO: second team member | Draft |
| `specs/logistic-regression/test-plan.md` | Theo, TODO: second team member | Draft |
| `specs/random-forest/summary.md` | Nate, Mohsan, Ivan | Draft |
| `specs/random-forest/implementation-plan.md` | Nate, Mohsan, Ivan | Draft |
| `specs/random-forest/test-plan.md` | Nate, Mohsan, Ivan | Draft |

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
