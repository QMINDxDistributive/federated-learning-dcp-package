# 0005: Train random forest trees at each site

| Field | Value |
|---|---|
| Title | Train random forest trees at each site |
| Status | Proposed |
| Date | 2026-11-20 |
| Owners | Nate, Mohsan, Ivan |
| Affects | [RF summary](../random-forest/summary.md), [implementation plan](../random-forest/implementation-plan.md), [test plan](../random-forest/test-plan.md), R1, R3, R4, R5, R8, R9, OQ-RF1 |

## Context

The showcase plan suggests merging trees trained at separate sites. We need to decide how the package builds a single forest across DCP workers. [Showcase plan](https://docs.google.com/document/d/181NJW-Uq353eHQrRfpFzJeYJSchxmJzSlqJQ2lfOs1c/edit)

## Options considered

| Option | Benefit | Cost |
|---|---|---|
| Train trees at each site | One independent job per site. Saved batches can be reused after a failure. | Each split sees one site's rows. Thresholds and leaf labels can expose information about that site. |
| Grow shared trees from split statistics | Each split can use evidence from several sites. | Jobs must synchronize as trees grow. Missing sites change the split statistics, and small counts can expose information. |

## Decision

Start with site-trained trees, a fixed tree count per site, and one vote per tree. This makes the first DCP build one round of independent jobs. Equal site influence is a baseline to test.

## Consequences

Measure accuracy and ROC AUC against pooled and site-only forests before choosing site weights. Measure batch size before setting tree limits. Where rows travel depends on the shared DCP decision.
