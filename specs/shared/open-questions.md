# Open Questions

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Skeleton |
| Last updated | 2026-11-20 |

Add anything unknown here instead of guessing. When a question is resolved, set its
status to `Resolved` and link the decision record in `specs/decisions/`.

Status values: `Open`, `In discussion`, `Resolved`.

| ID | Question | Area | Raised by | Owner | Status | Resolution / decision |
|---|---|---|---|---|---|---|
| OQ1 | Who is the second logistic regression team member? | Team | Repo setup | TODO | Open | |
| OQ2 | What is the exact GitHub org name? Specs say "QMind Distributed"; the repo URL uses `QMINDxDistributive`. | Repo | Repo setup | TODO | Open | |
| OQ3 | What language(s) and runtime will the package and worker script use? | Shared | Repo setup | TODO | Open | |
| OQ4 | What license will the public package use? | Shared | Repo setup | TODO | Open | |
| OQ5 | What datasets will be used for development, testing, and model-quality checks? | Shared | Repo setup | TODO | Open | |
| OQ6 | How will the package be distributed publicly (package registry, source only, other)? | Shared | Repo setup | TODO | Open | |
| OQ7 | What are the DCP worker runtime constraints (e.g. WASM, available APIs, memory, slice time limits)? | DCP | Repo setup | TODO | Open | |
| OQ8 | What does DCP provide for local or mocked testing without a live network? | DCP / testing | Repo setup | TODO | Open | |
| OQ9 | Who creates and manages compute groups, and how are workers authorized to join them? | DCP | Repo setup | TODO | Open | |
| OQ10 | What is the minimum worker participation for a training run to count as successful (R8)? | Shared | Repo setup | TODO | Open | |
| OQ11 | Where are successful slice results persisted (R9), and who can access them? | Shared | Repo setup | TODO | Open | |
| OQ12 | TODO | | | | Open | |
| OQ-RF1 | Should the first forest use site-trained trees and equal votes per tree with a fixed budget per site? When should site sample size affect a site's voting weight? | Random forest | RF draft | RF track | In discussion | [Proposed decision 0005](../decisions/0005-rf-site-trained-trees.md) |
| OQ-RF2 | Will the first RF DCP run send public or synthetic rows in slices, or use remote data? Which release includes the live DCP loop? | Random forest | RF draft | RF track and shared DCP owners | Open | |
| OQ-RF3 | What minimum site count or coverage makes a partial forest usable, and how should RF inherit the shared retry and result storage policies? See OQ10 and OQ11. | Random forest | RF draft | RF track | Open | |
| OQ-RF4 | Which held-out dataset, baseline, and quality threshold are required for sign-off? See OQ5. | Random forest | RF draft | RF track | Open | |
| OQ-RF5 | What tree settings and defaults fit the agreed runtime, result payload, and model size budgets? See OQ7. | Random forest | RF draft | RF track | Open | |
