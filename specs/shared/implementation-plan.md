# Shared Implementation Plan

| Field | Value |
|---|---|
| Owner | Everyone |
| Status | Draft |
| Last updated | 2026-11-23 |
| Related | [summary.md](summary.md), [test-plan.md](test-plan.md), [dependencies.md](dependencies.md), [open-questions.md](open-questions.md) |

> **Ownership rule.** Anything that does not depend on the model lives here: DCP, jobs, compute
> groups, the worker script, the site data format, validation, failure handling, saved results,
> the model file envelope, and dependencies. A track plan describes only what is specific to its
> model (maths, hyperparameters, what a site computes, how results combine, model-specific
> payload) and links here for everything else. If a rule applies to both tracks, it belongs in
> this file, not in either track plan.
>
> Track plans: [logistic regression](../logistic-regression/implementation-plan.md),
> [random forest](../random-forest/implementation-plan.md).

Status of the code: the shared runners and the logistic regression track exist as a prototype
(`src/`, `demo/`). Where this plan describes behavior that the prototype does not have yet, the
text says so.

## Architecture

```
coordinator (user machine)                DCP scheduler                  each site's machine
──────────────────────────                ─────────────                  ───────────────────
train(...)                                                               site agent (fl-agent.js)
 ├─ validate settings (before any job)                                    ├─ serves rows on 127.0.0.1
 ├─ per round: one job per site ──────▶  routes each job to that site's ─▶ DCP worker (only that
 │            ◀── site result ─────────   compute group                    site's compute group)
 ├─ validate and save each result                                         │   work function reads rows
 ├─ combine results (track-specific)                                      │   locally, returns a result
 └─ export model (shared envelope)  ◀── heartbeats: name, row count, feature names (never rows)
```

| Component | Runs on | Responsibility |
|---|---|---|
| Coordinator | User machine | Validates settings, deploys jobs, validates and saves results, combines them, exports the model |
| Runner | Coordinator machine | Executes one round for every site and returns results. Local runner: in process, no DCP. DCP runner: one DCP job per site |
| Work function | A DCP worker, or in process for local runs | What one site computes in one round. Track-specific content, shared constraints ([below](#work-function-constraints)) |
| Site agent and DCP worker | Each site's machine | Hosts the site's rows locally and runs only that site's jobs ([worker script](#worker-setup-script)) |
| DCP scheduler | DCP | Hands jobs to workers. Never sees rows in remote data mode |

## Modules and responsibilities

Shared modules only. Each track lists its own files in its own plan:
[LR modules](../logistic-regression/implementation-plan.md#modules-and-responsibilities),
[RF file layout](../random-forest/implementation-plan.md#file-layout).

```
package.json             exact-pinned dependencies, npm scripts
src/
  index.js               public exports for all tracks
  runners/               shared: local runner and DCP runner
  lr/                    logistic regression track
  rf/                    random forest track (planned)
test/                    node --test suites and fixtures
tools/                   data preparation and reference scripts (Python, not shipped)
demo/                    showcase app: coordinator server, dashboard, join page (not package API)
fl-agent.js              standalone site agent, Node built-ins only (decision 0004)
specs/                   specs and decision records
```

| Module | Responsibility | Runs where |
|---|---|---|
| `src/index.js` | Public exports. Loads the DCP runner lazily, so local use needs no `dcp-client` | User machine |
| `src/runners/local.js` | Runs every site's work function in process. Arguments and results go through JSON, as they would over DCP | User machine |
| `src/runners/dcp.js` | One DCP job per site per round, all sites deployed together. Result events, retries, per-site events for the dashboard | Coordinator machine |
| `src/runners/dcpJob.js` | Runs a one-slice job and returns its result as soon as it exists ([retrieval](#discrete-jobs)) | Coordinator machine |
| `src/runners/dcpInit.js` | Loads `dcp-client`, sets identity, unlocks the payment keystore once | Coordinator machine |
| `fl-agent.js`, `demo/agent.js` | Site agent ([worker script](#worker-setup-script)) | Site machine |

**Gap to close.** `local.js` and `dcp.js` currently import the logistic regression work function
directly. They need to take the work function as an input before the random forest track can
reuse them (TODO, owner: shared).

### Public API

- `train({ runner, hyperparameters, onEvent })` returns the trained model object (R4). `onEvent`
  receives progress events.
- A **runner** is `{ siteNames, runRound(stage, args, round) }`. `runRound` deploys one round to
  every site and resolves to one result per site, **in `siteNames` order**. The local and DCP
  runners have this shape, so coordinators and tests do not know which one they use.
- A **site** given to the DCP runner is `{ name, data?, dataUrl?, computeGroups? }`. `data` carries
  rows in the slice ([decision 0001](../decisions/0001-v0-1-send-data-with-slices.md)).
  `dataUrl` is a URL on the site's own machine ([decision 0004](../decisions/0004-remote-data-on-site-laptops.md)).
- TODO (OQ14): how a user chooses the model type, and whether both tracks share one `train` entry
  point. Today `src/index.js` exports only the logistic regression `train`.

### Hyperparameter validation

Rules for every track (R2):

- Validation runs on the coordinator **before any job is deployed**. Workers receive only
  validated values.
- Unknown keys are an error.
- A key that does not apply to the chosen variant (for example `learningRate` with
  `method: "newton"`) is an error, not silently ignored.
- Range and type errors name the setting and the allowed values.
- Anything that depends on the sites (for example a limit tied to the number of features) is
  checked on the coordinator from site metadata, before training starts.

Settings that every track accepts. A track plan does not repeat these. It lists only its defaults
where they differ:

| Setting | Meaning | Valid values | Default |
|---|---|---|---|
| `minParticipants` | Fewest sites that must return a valid result in a round for the run to continue (R8) | integer 1 to K | LR: K (all sites). RF: 2, **Proposed** (OQ-RF3) |
| `roundTimeoutMs` | How long to wait for one attempt of a round before redeploying the missing sites | integer > 0 | TODO, after job latency is measured ([S-E2](test-plan.md#dcp-end-to-end-tests)). The prototype uses 60 000 |
| `maxRoundRetries` | Redeployments of the sites still missing after a timeout or failed result | integer ≥ 0 | 2 |

K is the number of sites. A round is one job per site. A model that trains in one round has one
round.

## Site data

Each site holds its rows locally and supplies them as one JSON file:

```json
{ "featureNames": ["..."], "X": [[0.0, 1.0]], "y": [0, 1], "site": "optional name" }
```

**Rules** (both tracks currently train binary classifiers):

- Every feature is numeric and finite. Categorical features are already encoded, identically at
  every site.
- Every site has the same features, in the same order, with the same names.
- The label is binary, coded `0` or `1`.
- No missing values in v0. A row with a missing value fails validation. Imputation is a non-goal.
- Every site has at least one row of each class.
- Minimum site size is a track rule (it depends on what the model sends), not a shared rule.

**Where each check runs.** Checks that compare sites (same feature names and order) run on the
coordinator from per-site metadata, before any training job is deployed. Checks on a site's rows
run where the rows are (the work function, or the site agent). A failed check names the site and
the problem, and stops training before any result is accepted.

### Data harmonization

Real hospitals record the same information differently: column names, units (for example
cholesterol in mg/dL or mmol/L), category coding, missing columns, missing values, and outcome
definitions (for example ACR20 at 3 or 6 months). Different *patients* at each site are expected
and handled by training. Different *recording* of the same thing is not, and some of it (units,
outcome definitions) passes validation silently.

Federated health networks handle this by agreeing a common data model up front: one document
listing every column, its unit, its coding, and the outcome definition. Each hospital converts
its own records to that format with a script that runs inside the hospital.

This package checks and does not fix. Hospitals convert their own data, and the checks above
validate it. A track may add warn-only checks that catch mismatches the rules cannot (the
logistic regression [site shift check](../logistic-regression/implementation-plan.md#site-shift-check)
is one). The shape of the common data model for PsA (columns, units, coding, outcome definition,
missing-value rule) is OQ-LR7.

## Model output format

Every model file is JSON with this envelope. A track adds its own payload next to it.

```json
{
  "formatVersion": 1,
  "modelType": "logistic-regression",
  "featureNames": ["age", "bmi"],
  "training": {
    "runId": "run-2026-11-23-01",
    "hyperparameters": { "...": "resolved values, not user input" },
    "participation": [
      { "round": 1, "sites": ["site-a", "site-b"], "missing": ["site-c"] }
    ],
    "warnings": [],
    "trainedAt": "2026-11-23T10:00:00Z"
  }
}
```

| Key | Meaning |
|---|---|
| `formatVersion` | Integer, versioned separately for each `modelType`. A loader rejects versions it does not know |
| `modelType` | `"logistic-regression"` or `"random-forest"` |
| `featureNames` | Ordered. Input rows must have exactly this length and order |
| `training.runId` | Identifies the run that produced the model. Also keys saved results ([Result persistence](#result-persistence)) |
| `training.hyperparameters` | The resolved values used, including defaults |
| `training.participation` | One entry per round: sites that contributed and sites that did not. A round with missing sites is partial |
| `training.warnings` | Warn-only findings from validation, in order |
| `training.trainedAt` | ISO-8601 timestamp |

This envelope is **Proposed**. It replaces two earlier shapes (the logistic regression draft used
a bare list of site names per round, the random forest draft a `version` string and
`contributing_sites`). Track-specific keys, such as `training.method` or `trees`, are defined in
the track plan.

**Inference (R5).** Loading and predicting use only JSON parsing and arithmetic, with no
dependency on this package or DCP. The package's `load` and `predict` also check the model before
use:

- reject an unknown `formatVersion`, a `modelType` that does not match, or a malformed payload;
- reject an input row whose length differs from `featureNames`, or that holds a non-finite value.

Each track shows a short reference `predict` that needs no imports.

## Data flow

1. The coordinator validates settings, then sends each site its round arguments.
2. Each site's work function reads that site's rows (inline in the slice, or fetched from the
   site's own machine) and returns a result. Which numbers a result holds is track-specific.
3. The coordinator validates each result, saves it, and combines results (track-specific).
4. After the last round it exports the model.

No row-level data appears in any result, saved result, log, or exported model (R6). Rows travel
only in slice inputs, and only in inline mode.

| Mode | Where rows are | Meets | Status |
|---|---|---|---|
| Inline | Inside each site's slice input | R6 weakened to "rows only in slice inputs". R7 deferred | v0.1 ([0001](../decisions/0001-v0-1-send-data-with-slices.md)). Public or synthetic data only |
| Remote data | On the site's machine. The worker there fetches them over loopback | R6, R7 | Prototype in `src/runners/` and `demo/` ([0004](../decisions/0004-remote-data-on-site-laptops.md)). Full release: OQ12, OQ13 |

**Data source boundary.** A work function takes `{ X, y, featureNames }` and never knows where it
came from. A small loader turns the slice input into that object. Switching between inline and
remote data changes only the loader. Algorithms, payloads, and tests stay the same. In inline mode
slice placement does not affect correctness. One job per site is still used so the structure
holds when remote data makes placement matter.

## DCP job design

### DCP remote data

In remote data mode a job's input is a `RemoteDataSet` holding one URL, on the site's own machine
(for example `http://localhost:7071/data.json`). The worker on that machine fetches the URL, so
rows never go through DCP (R6, R7). Safeguards, from
[decision 0004](../decisions/0004-remote-data-on-site-laptops.md):

- The URL is bound to `127.0.0.1`, so only processes on that machine can read it.
- The worker may fetch only that origin (`dcp-worker --allow-origin`).
- The job is restricted to the site's compute group, so it cannot land elsewhere.
- Backstop: the work function checks `args.site` against the `site` label in the data and
  refuses to compute on another site's data. The coordinator rejects results labelled for the
  wrong site.

Remote data may reach the work function as an object, a JSON string, or bytes. The loader parses it.

### Discrete jobs

**One job per site per round, with one slice each. All K jobs of a round are deployed together.**

One job with K slices does not work. DCP hands slices to whichever workers ask first, so one
site could receive two slices and another none, and a slice could run on a machine that does not
hold its rows. Every algorithm here needs each site exactly once per round.

| Item | Value |
|---|---|
| Slice input | The site's rows (inline) or a remote data URL |
| Slice arguments | Round arguments from the track, plus `site` in remote data mode |
| Slice result | Plain JSON, defined by the track |
| Jobs per run | K × (rounds run + retries). Logistic regression adds a round 0 |
| Payment | A fixed DCC offer per slice (`dccPerSlice`, default 1), because the market price has no per-slice ceiling. A run costs about K × rounds × `dccPerSlice` plus retries |

**Result retrieval.** The runner takes whichever comes first: the pushed `result` event, polling
the scheduler's result service, or `exec()` resolving. It fails fast on `nofunds`, `error`, and
`cancel`. This exists because the `complete` event sometimes arrived late or never in testing
(`src/runners/dcpJob.js`).

**Mapping to Distributive's suggested package shape** (Alex Salgo, email received by 2026-11-08):

| Alex's function | This package |
|---|---|
| `trainModelOnDcp(args)` | `train()`: validate, loop over rounds, return the model |
| `loadLocalData(args)` | The loader behind the [data source boundary](#data-flow) |
| `createModel(args)` | Track-specific starting state |
| `deployDcpTrainingStep(...)` | `runner.runRound`: one job per site, results saved as they arrive |
| `configureJob(job, host)` | The DCP runner's job setup: compute groups, `job.on()` handlers, result validation |
| `workFunction(sliceData, sliceArgs)` | The track's work function |
| `aggregateResults(args, model)` | The track's combine step, plus its stop rule |

Alex's order of work is the work function, then aggregation, then the DCP loop (which may wait
for v0.2). The [work breakdown](#work-breakdown) follows it.

### Work function constraints

- **Self-contained.** DCP ships the function as source text (`Function.prototype.toString`). It
  cannot use `require()`, closures over module scope, or helpers defined outside it. Everything it
  needs, including helpers and any random number generator, sits inside it. How shared modules could
  ship to workers is OQ3 and OQ7.
- **Same code everywhere.** The local runner and the tests call the same function that DCP runs,
  so tests cover what runs on workers.
- **Sandbox.** No filesystem access and limited network access. DCP provides a global `progress()`
  that does not exist elsewhere, so the function checks for it.
- **Results.** Aggregates (or a model fragment) plus `site` and `device` labels. No rows.
- **Floating point.** Results differ slightly between devices, so comparisons use tolerances.

### Compute groups

A compute group is DCP's only way to limit which workers run a job. Jobs **attach** to a group and
workers **join** one.

- Remote data mode needs **one compute group per site, with that site's worker as its only
  member**. A job can then run only there. One shared group is not enough, because DCP chooses
  which member takes each job, so a job would often land on the wrong machine, fail, and be retried.
- `dcp-client` cannot create groups. Distributive creates them, as a pool to borrow from (for the
  demo, `qmind-fl-1` to `qmind-fl-5`). The pool size caps how many sites can join at once.
- In inline mode rows travel with the job, so any worker can run it. The demo sends every job to one
  shared group for this mode.
- A hospital would have a long-lived group of its own, which also acts as its consent: its worker
  runs nothing that is not attached to it.
- Group secrets reach site agents over plain HTTP in the demo. That is acceptable for a demo and not
  for real data.

Ways to remove the manual setup (creating groups from code, sending a job to one specific worker,
limiting workers to approved work functions) are in
[questions-for-alex.md](questions-for-alex.md). Who creates groups and authorizes workers is OQ9.

### Worker setup script

Site operators run one command, given by the coordinator's join page. It downloads `fl-agent.js`,
a single file that uses only Node.js built-ins (Node 20 or later). The agent:

1. serves the site's data file at `http://localhost:<port>/data.json`, bound to `127.0.0.1`;
2. registers with the coordinator, sending a name, the row count, and the feature names, never
   rows, and receives one compute group;
3. starts a DCP worker that joins only that group (`--join`, `--no-global`) and may fetch only its
   own port (`--allow-origin`);
4. sends a heartbeat every 5 seconds. A site that stops shows as offline after about 15 seconds.
   Ctrl+C leaves the session, stops the worker, and returns the group to the pool.

Tested on Windows and macOS (end-to-end test, 2026-11-17, recorded in decision 0004). Identity
comes from `DCP_API_KEY` or keystores in `~/.dcp/`, and keys are never committed
([credentials](../../demo/dcp-credentials.md)). The demo runs the evaluator in Node mode, which
`dcp-worker` warns is not for production (TODO, [0004](../decisions/0004-remote-data-on-site-laptops.md)).

## Training rounds or aggregation

The shared structure is: one round is one job per site, and the coordinator combines the K results
before the next round. How many rounds, what a site computes, and how results combine are
track-specific:

- Logistic regression: [training rounds](../logistic-regression/implementation-plan.md#training-rounds-or-aggregation)
- Random forest: [site training and aggregation](../random-forest/implementation-plan.md#site-training-and-aggregation)

## Failure handling

Rules for every track (R8, R9):

1. **A site result is failed** if it does not match the track's result schema, holds a non-finite
   number, is labelled for another site or run, or fails a track check (for example, a changed
   row count). A failed result is logged and treated as missing.
2. **Retries.** The runner waits up to `roundTimeoutMs`, saves each valid result as it arrives
   (the job's `result` event), then redeploys **only the missing sites**, up to `maxRoundRetries`
   times.
3. **First valid result wins.** A later result for the same run, round, and site is ignored.
4. **Participation.** After retries, if at least `minParticipants` sites returned valid results,
   the round continues with them, and the missing sites are recorded in `training.participation`.
   What "continues" means is track-specific. Below `minParticipants` the run stops, keeps its saved
   results, and returns an error that names the missing sites. It returns no model.

The prototype retries but does not yet implement partial participation: `train()` requires
`minParticipants` to equal K.

### Result persistence

(R9.) Each valid site result is saved as it arrives. Where, in what format, and for how long are
open (OQ10, OQ11).

- **Key.** Run ID, round, and site.
- **Fingerprint.** Each saved result records the inputs it was computed from: the round arguments,
  the settings, the seed (if any), and the site's input snapshot. A restarted run reuses a saved
  result **only if the fingerprint matches**. Otherwise it reruns that site. If the snapshot cannot
  be verified, it reruns the site. How a site proves its snapshot is unchanged is TODO (OQ11).
- **Checkpoints.** A track that trains over several rounds also checkpoints the coordinator's state
  after each round. Its fields are track-specific.
- **Contents.** Saved results and checkpoints hold only what a site result holds. They never
  contain rows (R6).

## Privacy

- v0.1 uses **public or synthetic data only**. Real patient data waits for remote data and for the
  per-track privacy review ([0001](../decisions/0001-v0-1-send-data-with-slices.md)).
- What leaves a site is defined by the track. Each track states what its results could reveal
  and what limits it applies.
- Secure aggregation and differential privacy are not built in v0 (see
  [non-goals](summary.md#non-goals)).

## Dependencies

[Policy](dependencies.md): minimize, pin exact versions, record every package in the table.

- `dcp-client`, pinned to exactly `5.9.0`, used only by the DCP runner and the demo
  ([decision 0006](../decisions/0006-dcp-client-dependency.md)).
- Work functions and model inference use no packages in either track. Each track plan names the
  small pieces it writes by hand.

## Work breakdown

Shared tasks, in Alex's order. Track tasks are in each track plan.

| # | Task | Requirement IDs | Release | Status |
|---|---|---|---|---|
| S1 | Local runner: all rounds in one process, no DCP | R1, R4 | v0.1 | Prototype (`src/runners/local.js`) |
| S2 | Runners take the work function as an input, so both tracks reuse them | R1, R3 | v0.1 | Not started |
| S3 | DCP runner: one job per site per round, result events, timeouts, retries | R3 | v0.1 or v0.2 (OQ13) | Prototype (`src/runners/dcp.js`) |
| S4 | Settings validation shared rules and the shared settings | R2 | v0.1 | Not started |
| S5 | Model envelope, `load`, and `predict` checks | R4, R5 | v0.1 | Not started |
| S6 | Partial participation (`minParticipants`) | R8 | With S3 | Not started |
| S7 | Result persistence with fingerprints, and checkpoint support | R9 | With S3 | Not started |
| S8 | Site agent and join flow | R10 | Showcase | Prototype (`fl-agent.js`, `demo/`) |
| S9 | Remote data loader | R6, R7 | Later ([0001](../decisions/0001-v0-1-send-data-with-slices.md)) | Prototype for the demo ([0004](../decisions/0004-remote-data-on-site-laptops.md)) |
| S10 | Public API and model-type selection | R4 | v0.1 | Not started (OQ14) |

## Owners

| Area | Owner(s) |
|---|---|
| Public API | TODO |
| Hyperparameter validation | TODO |
| Model output format | TODO |
| DCP job design | TODO |
| Worker setup script | TODO |
| Result persistence | TODO |
