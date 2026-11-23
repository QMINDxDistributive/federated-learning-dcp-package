# Open Questions

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Skeleton |
| Last updated | 2026-11-14 |

Add anything unknown here instead of guessing. When a question is resolved, set its
status to `Resolved` and link the decision record in `specs/decisions/`.

Status values: `Open`, `In discussion`, `Resolved`.

Questions that need an answer from Distributive are collected in
[questions-for-alex.md](questions-for-alex.md), and linked back to the IDs below.

| ID | Question | Area | Raised by | Owner | Status | Resolution / decision |
|---|---|---|---|---|---|---|
| OQ1 | Who is the second logistic regression team member? | Team | Repo setup | TODO | Open | |
| OQ2 | What is the exact GitHub org name? Specs say "QMind Distributed"; the repo URL uses `QMINDxDistributive`. | Repo | Repo setup | TODO | Open | |
| OQ3 | What language(s) and runtime will the package and worker script use? | Shared | Repo setup | TODO | Open | |
| OQ4 | What license will the public package use? | Shared | Repo setup | TODO | Open | |
| OQ5 | What datasets will be used for development, testing, and model-quality checks? | Shared | Repo setup | TODO | Open | LR track proposal in the [LR test plan](../logistic-regression/test-plan.md#test-datasets) (2026-11-14); needs the random forest track's input |
| OQ6 | How will the package be distributed publicly (package registry, source only, other)? | Shared | Repo setup | TODO | Open | |
| OQ7 | What are the DCP worker runtime constraints (e.g. WASM, available APIs, memory, slice time limits)? | DCP | Repo setup | TODO | Open | |
| OQ8 | What does DCP provide for local or mocked testing without a live network? | DCP / testing | Repo setup | TODO | Open | |
| OQ9 | Who creates and manages compute groups, and how are workers authorized to join them? | DCP | Repo setup | TODO | Open | |
| OQ10 | What is the minimum worker participation for a training run to count as successful (R8)? | Shared | Repo setup | TODO | Open | |
| OQ11 | Where are successful slice results persisted (R9), and who can access them? | Shared | Repo setup | TODO | Open | |
| OQ12 | Alex's email (2026-11-08) says v0 should not use remote data, so site data is sent over DCP. R6 and R7 still say training data never travels over DCP and that remote data is used. Do we rewrite R6/R7 for v0, and does per-site compute-group routing still matter for v0? | Shared / DCP | Team meeting 2026-11-08 | Theo | In discussion | [0001](../decisions/0001-v0-1-send-data-with-slices.md) (Proposed): v0.1 sends data with slices; R6/R7 deferred to the remote data release |
| OQ13 | Which release adds remote data (v0.2 or later), and does the DCP loop ship in v0.1 or v0.2? (Alex: the loop "could even wait for v0.2".) | Shared / planning | Alex email | Theo | Open | |
| OQ-LR1 | Binary logistic regression only, or also multiclass (softmax)? | Logistic regression | LR draft | Theo | Resolved | Binary only ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)) |
| OQ-LR2 | Alex's outcome metrics include continuous scores (DAPSA, PASI). Does this track also need linear regression, or is that a separate track? | Logistic regression | Research summary | Theo | Resolved | Stretch goal after v0.1 ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)) |
| OQ-LR3 | Default `method`: FedAvg first (2026-11-04 plan) or Newton-style? Decide after measuring round latency (test LR-E3). | Logistic regression | LR draft | Theo | Resolved | Newton-style ([0002](../decisions/0002-newton-default-method.md)) |
| OQ-LR4 | Minimum rows per site (`minSiteRows`), and should it scale with the number of features d (e.g. Newton requires n_k > d(d+1)/2)? | Logistic regression | LR draft | Theo | Resolved | `minSiteRows: "auto"` = max(50, numbers sent per round), plus `siteSizeCheck` ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)) |
| OQ-LR5 | Is sharing a site's Hessian (Newton-style) acceptable for v0, given that it reveals more than coefficients? | Logistic regression / privacy | Research summary | Theo | Resolved | Yes for v0.1 public data; revisit before real patient data ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)) |
| OQ-LR6 | When a site is still missing after retries, should a Newton-style round proceed without it (result no longer equals pooled training) or wait/abort? | Logistic regression | LR draft | Theo | Resolved | Retry, then proceed with responders and mark the round partial ([0003](../decisions/0003-lr-scope-site-rules-class-weights.md)) |
| OQ-LR7 | How is real hospital data harmonized before training: a shared data template, units, category coding, missing values? | Logistic regression / shared | Theo, 2026-11-14 | Theo | Open | |
