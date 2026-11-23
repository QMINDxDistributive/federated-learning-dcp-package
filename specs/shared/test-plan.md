# Shared Test Plan

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [summary.md](summary.md), [implementation-plan.md](implementation-plan.md) |

> **Ownership rule.** A test that checks behavior shared by both tracks (DCP, validation, failure
> handling, saved results, data locality, the model envelope) is written once here. **Each track
> runs every shared test against its own model**, using its own fixture and result schema. A track
> test plan lists only tests of its model's maths and payloads, plus any track-specific condition
> on a shared test. Each test names the requirement IDs (R1 to R10) it covers.

Test case format: `ID | description | requirement IDs | expected result`

## How a track uses these tests

For every shared test, the track supplies: a seeded fixture, its result schema, and the model's
settings. A shared test passes for a track only when it passes with that track's inputs. Each
track plan states its fixture and records any extra pass condition.

| Track | Fixture and schema defined in |
|---|---|
| Logistic regression | [LR test plan](../logistic-regression/test-plan.md#running-the-shared-tests) |
| Random forest | [RF test plan](../random-forest/test-plan.md#running-the-shared-tests) |

## Fixtures

- **Synthetic**, generated in the tests from a fixed seed, with known structure. Used for exactness,
  validation, partial participation, and recovery tests.
- **BRFSS sample states** (`demo/data/sites/`): five states, a binary arthritis label, 10 numeric
  features, 150 to 3 000 rows per site (new-york 3 000, florida 1 000, washington 400, minnesota 250,
  alaska 150). Both tracks can train on them.
- Track-specific datasets (for example LR's Fed-Heart-Disease) are listed in the track test plan. The
  agreed set for quality checks is OQ5.

## Tolerances

Floating-point results differ between devices, so no test compares floats exactly. Each test states
its tolerance. Numeric thresholds for a model's maths are in the track test plan.

## Unit tests

| ID | Description | Req | Expected |
|---|---|---|---|
| S-U1 | Export a model, reload it from JSON, and predict | R4, R5 | Predictions identical before and after the round trip |
| S-U2 | Load a model with an unknown `formatVersion`, the wrong `modelType`, or a malformed payload | R5 | Rejected with an error that names the problem |
| S-U3 | Predict with a row of the wrong length, or one holding NaN or Infinity | R5 | Rejected with an error |
| S-U4 | Copy the track's reference `predict` into a file with no imports and run it | R5 | Matches the package's `predict` |

## Integration tests

These run every round in one process with the local runner and no DCP.

| ID | Description | Req | Expected |
|---|---|---|---|
| S-I1 | Local runner whose sites finish in a different order each time | R1 | Results come back in `siteNames` order, and the model is the same |
| S-I2 | Train twice with the same seed and inputs on one machine | R1 | Identical model |
| S-I3 | Inspect what the local runner passes to a work function and what it returns | R1, R3 | Both have gone through JSON, so tests see what DCP would send |

## DCP end-to-end tests

These need the DCP loop (S3 in the [work breakdown](implementation-plan.md#work-breakdown)), which may
arrive in v0.2 (OQ13). Until then, the local runner tests are the main check.

| ID | Description | Req | Expected |
|---|---|---|---|
| S-E1 | Same seeded fixture on the local runner and on real DCP, with one worker per site | R3, R7 | The two models match within the track's tolerance. Each site returns a valid result |
| S-E2 | Record time from deploy to last result per round, and result bytes per site, for 1, 4, and 8 sites | R3 | Numbers recorded. They set the `roundTimeoutMs` default and feed each track's budget checks |
| S-E3 | Each site's job runs only on that site's compute group. Check worker logs | R7, R10 | Correct placement. Informational in inline mode. Depends on OQ9 |
| S-E4 | Run the worker script on a clean machine | R10 | It serves the data on `127.0.0.1`, joins only its group, fetches only its own origin, sends heartbeats, and returns the group on exit |
| S-E5 | Send a job to a worker on the wrong machine in remote data mode | R6, R10 | The work function refuses to compute on that data. The coordinator rejects the result and retries |

## Invalid-input tests

All must fail **before any training round is deployed**, with an error naming the site or setting.
No result is accepted.

| ID | Description | Req |
|---|---|---|
| S-V1 | Unknown hyperparameter key | R2 |
| S-V2 | A key that does not apply to the chosen variant | R2 |
| S-V3 | Out-of-range or wrong-type values, and `minParticipants` greater than the number of sites | R2 |
| S-V4 | Non-numeric or non-finite feature value at one site | R6 |
| S-V5 | Missing value at one site | R6 |
| S-V6 | Label not in {0, 1} | R6 |
| S-V7 | A site with only one class | R6 |
| S-V8 | Feature names or order differ between sites | R6 |

## Partial-participation tests

Use a local runner that can drop a chosen site in a chosen round.

| ID | Description | Req | Expected |
|---|---|---|---|
| S-P1 | Drop sites until exactly `minParticipants` remain, then one fewer | R8 | At the minimum: completes and records the missing sites in `training.participation`. One fewer: stops with an error naming the missing sites, keeps saved results, returns no model |
| S-P2 | A site returns NaN, a result of the wrong shape, or a result labelled for another site | R8 | Treated as a failed site, logged, and retried |

## Failed-job recovery tests

| ID | Description | Req | Expected |
|---|---|---|---|
| S-C1 | Interrupt a round after some sites returned, then resume with identical inputs | R9 | Only the missing sites are redeployed. Saved results are reused |
| S-C2 | Resume with changed data, settings, or seed | R9 | Saved results are not reused, or the resume is rejected with a clear error |
| S-C3 | Send a duplicate result for the same run, round, and site | R9 | Counted once |

## Data-locality checks

| ID | Description | Req | Expected |
|---|---|---|---|
| S-L1 | Validate every site result against the track's strict schema | R6 | No extra keys. No row-level data |
| S-L2 | Inline mode: search job inputs, results, saved results, logs, and exports for known row values | R6 | Rows appear only in slice inputs |
| S-L3 | Remote data mode: inspect job inputs and traffic through DCP | R6, R7 | Job inputs hold only the remote URL. Workers read rows on their own machine. No rows cross DCP |
| S-L4 | Validate saved results and checkpoints against the track's schema | R6, R9 | They hold only what a site result holds |

Claim full R6 and R7 coverage only after S-L3 passes against real remote execution.

## Model-quality checks

Each track compares its federated model with a baseline on a held-out set, using its own metrics
and thresholds. For every track:

- Report per-site metrics and confidence intervals, not a single accuracy number. Regulators expect
  this.
- Record the split, the seed, and the model size.
- Use the same holdout for every compared model.

Track-specific checks: [LR](../logistic-regression/test-plan.md#model-quality-checks),
[RF](../random-forest/test-plan.md#model-quality-and-payload-checks).

## Pass/fail criteria

A track passes the shared tests when, with that track's fixture and schema:

- all S-U, S-I, S-V, S-P, S-C, and S-L1, S-L2, S-L4 tests pass on the local runner;
- S-E1 and S-E3 pass on DCP in the selected data mode, and S-E2 is recorded;
- S-L3 passes before the release claims R6 and R7.

The release also needs each track's own pass criteria.
