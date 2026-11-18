# 0004: Keep each site's rows on its own machine with DCP remote data and per-site compute groups

| Field | Value |
|---|---|
| Title | Keep each site's rows on its own machine with DCP remote data and per-site compute groups |
| Status | Proposed |
| Date | 2026-11-16 |
| Owners | Theo |
| Affects | [shared summary](../shared/summary.md) R6, R7, R10; [shared implementation plan](../shared/implementation-plan.md#dcp-remote-data) (remote data, compute groups, worker setup script); [0001](0001-v0-1-send-data-with-slices.md); OQ12 |

## Context

[0001](0001-v0-1-send-data-with-slices.md) sends each site's rows inside its DCP slice. That
was the right first step, but for the showcase demo we want each state's dataset on a different
physical laptop, with the rows never going through DCP. That is the R6/R7 story the project
is ultimately about.

dcp-client 5.9 already supports this. A job's input can be a `RemoteDataSet` of URLs, and the
worker that runs the slice fetches the URL itself. Workers only fetch from origins they are
allowed (`dcp-worker --allow-origin <origin>`), and a job can be restricted to a compute group
whose only member is that site's worker (`job.computeGroups`, `dcp-worker --join`,
`--no-global`). See `node_modules/dcp-client/examples/nodejs/remote-data/` and the
`dcp-worker` 4.7.0 help text.

## Options considered

### Option 1: Keep 0001, only route each job to the site's laptop

- Description: per-site compute groups, but the rows still travel in the slice.
- Pros: no change to the work function or data path.
- Cons: the rows still pass through the scheduler, so the claim "data stays on the laptop"
  would be false.

### Option 2: Remote data from a loopback URL on each laptop, routed by per-site compute group

- Description: any number of laptops join by opening the coordinator's join link (shown with
  a QR code on the dashboard) and running the one command it gives. That command downloads
  `demo/agent.js`, which serves the laptop's data file at `http://localhost:<port>/data.json`,
  bound to 127.0.0.1. The agent registers with the coordinator, sending a name, the row count and
  the feature names (never rows), and is given one compute group from a pool. It then starts a
  DCP worker that joins only that group (`--join`, `--no-global`) and may fetch only that port
  (`--allow-origin`). The coordinator deploys one job per online laptop per round with
  `RemoteDataSet([dataUrl])`, attached to that laptop's group. The worker fetches its own
  laptop's file over loopback, and only aggregates go back.
- Pros: the rows never leave the laptop or touch DCP. The work function and Newton maths do
  not change. Each port is only reachable on its own laptop, so a job that lands on the wrong
  machine cannot read the right data. If it reads that machine's data instead, the work
  function's `args.site` check and the coordinator's result check reject it.
- Cons: each laptop needs Node.js and must reach the coordinator over the network. Compute
  groups cannot be created from dcp-client, so a pool must be created in the portal ahead of
  time, and the pool size caps how many laptops can join. Group secrets reach the agents over
  plain HTTP on the LAN, which is fine for a demo but not for real data. The coordinator can no longer compute the "each state
  alone" baselines from rows, so they are precomputed offline (`demo/baselines.js`).

## Decision

Option 2 (Proposed) for the demo's DCP mode. The library keeps both paths: `site.data`
(0001) and `site.dataUrl` (this decision), chosen per site in `createDcpRunner`.

## Consequences

- `src/lr/workFunction.js` accepts remote data delivered as an object, JSON text or bytes. It
  checks `args.site` against the data's `site`, and returns `site` and `device` labels, plus
  `sourceBytes` in round 0. Results still contain no rows.
- `validateResult` rejects a result computed on another site's data.
- `createDcpRunner` takes `dataUrl` per site and reports when a worker picks up a slice
  (`distributed`, from the job's `status` event), so the live dashboard can show laptops
  coming online.
- The compute-group pool lives in `demo/devices.json` (gitignored), and `demo/participants.js`
  hands groups out on join and takes them back on leave. Laptops send a heartbeat every 5 s and
  show as offline after 15 s without one. A run uses the laptops online when it starts
  (at least two); partial participation within a run is still not implemented.
- The coordinator's dashboard and controls answer only on loopback. The join page, agent
  download and agent API are open to the LAN, and the join and sample endpoints require a
  session token that changes on every restart.
- Open questions for Distributive (creating groups from code, sending a job to one specific
  worker, browser workers, limiting workers to approved work functions) are tracked in
  [questions-for-alex.md](../shared/questions-for-alex.md).
- The demo's evaluator runs in Node mode (`dcp-evaluator-start -t node -e <node> --additional-files=<evaluator-node.js>`), which `dcp-worker` warns is not
  for production. TODO: confirm with Distributive whether to use the native evaluator or the
  Windows screensaver installer on the teammates' laptops instead.
- **Tested end to end on DCP, 2026-11-17.** Three machines (two Windows laptops and one Mac),
  each holding one state's dataset, each worker in its own compute group (`qmind-fl-1` to
  `qmind-fl-5`, created by Distributive). Every job ran only on its own machine's worker, which
  read the rows from `localhost` through `RemoteDataSet`; only aggregates came back, and
  training converged. See "End-to-end test" below.
- Compute groups: Distributive created them (A1); we cannot. Per Alex, DCP · data in job mode
  (0001 path) sends every job to one shared group (`queens`), which is fine while rows travel in
  the slices.
- Once accepted, R6 and R7 hold for the demo's DCP mode, and the shared plan's "DCP remote
  data", "Compute groups" and "Worker setup script" sections can link here.

## End-to-end test (2026-11-17)

Setup: coordinator on a Windows laptop (`npm run demo:dcp`), which also joined as one machine;
a second Windows laptop and a Mac joined from the join link, each with a different sample state.
`demo/devices.json` held five Distributive-created groups (`qmind-fl-1` to `qmind-fl-5`, one
shared secret). Result: all machines' jobs ran on their own workers, rows were read locally, and
training converged with the results popup.

Problems found and fixed on the way (all in `demo/agent.js` / `demo/worker.js` unless noted):

| Problem | Cause | Fix |
|---|---|---|
| Groups made on dcp.cloud got "Access Denied" | Credential lists store credentials, they do not create groups | Distributive created the groups; `npm run demo:check-groups` checks every group |
| `spawn bin\dcp-evaluator ENOENT` | `dcp-evaluator-start -t node` still launches the native binary | Pass `-e <node> --additional-files=<dcp-client>/libexec/evaluator-node.js` |
| Worker exits with code 25 | `--output text` is in dcp-worker's help but not in 4.7.0 | `--output=stdio` |
| Worker asks for a password | It uses `~/.dcp/id.keystore` when no identity is given | Throwaway `--dcp-identity=<random key>` per run |
| `--dcp-identity <key>` rejected | Only the `=` form is accepted | `=` form for all worker flags |
| Mac worker exits with code 81 | Default pid file `/var/run/dcp-worker.pid` is not writable | `--no-pidfile` |
| Evaluator left running after Ctrl+C (macOS) | Only the npx wrapper was stopped | Children run in their own process group, which is stopped as a whole |
| Machines stuck on "Computing gradient" | Late DCP status events (`src/runners/dcp.js`, dashboard) | Ignore pick-ups after a job's result |
| Identity password asked once per job (terminal) | Identity keystore not unlocked up front (`src/runners/dcpInit.js`) | Unlock once |

