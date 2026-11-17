# Questions for Alex (Distributive)

| Field | Value |
|---|---|
| Owner | Theo |
| Status | Open |
| Last updated | 2026-11-17 |

Questions to raise with Alex Salgo at Distributive. Each one says why we are asking and what
it would change. Where a question is also tracked in [open-questions.md](open-questions.md),
its ID is given. When Alex answers, record the answer and date here, update the linked open
question, and write a decision record if the answer changes the design.

Status values: `Open`, `Asked`, `Answered`.

## Alex's reply (2026-11-16) and what we found

Alex's advice for the showcase: any worker can join a private compute group (including a browser
worker: [dcp.work](https://dcp.work/) lets you set the group in the top left, and
[worker-browser](https://distributive.network/docs/worker-browser.html) shows how to embed one).
The hard part is giving the worker access to data on its own machine
([data-uri docs](https://docs.dcp.dev/advanced/data-uri.html)). He suggests getting a normal DCP
job working with the data sent in the job first, and saying in the showcase that the data would be
local in a real deployment. The demo now has that mode: **DCP · data in job**
(`npm run demo:dcp-job`).

What we found on 2026-11-17 while trying to set up groups ourselves:

- **We cannot create compute groups.** On dcp.cloud, credential lists store group credentials
  (join key + join secret) for *existing* groups. Setting a join secret for a new key fails with
  `DCPError: In operation describe: Insufficient information {} to identify compute group`. A
  list saved without a secret gives the worker `joinHash: ''`. A worker started with
  `dcp-worker --no-global --join qmind-fl-1,<secret>` fails with `insufficient information to join
  compute group`. So `qmind-fl-1` does not exist, and only Distributive can create it (A1).
- **How workers get group credentials:** either `dcp-worker --join key,secret` directly (what
  `demo/agent.js` does), or a dcp.cloud registration key whose credential lists name the groups,
  applied once with `dcp-worker --register=<key>[,label]` (A7). `dcp-worker --show=compute-groups`
  shows what a worker will try to join.
- **Evaluator:** `dcp-evaluator-start -t node` alone still launches the native evaluator binary,
  which an npx install does not have (`spawn bin\dcp-evaluator ENOENT`). The Node evaluator needs
  `-e <path to node> --additional-files=<dcp-client>/libexec/evaluator-node.js`. `demo/agent.js`
  finds these paths itself (A8).
- The data-uri docs confirm decision 0004's mechanism: `RemoteDataSet` URLs fetched by the worker,
  and `--allow-origin` for native, Docker and screensaver workers. Browser workers also need CORS
  headers on the data server and `allowOrigins` (A6, A9).

## Compute groups and job routing

Background: since [decision 0004](../decisions/0004-remote-data-on-site-laptops.md), each
site's rows stay on its own machine, and each job reads them from that machine's
`localhost`. A job must therefore run on one specific machine. The only routing control we
have found is the compute group, so each site needs its own group (see
[demo/README.md](../../demo/README.md#why-one-compute-group-per-laptop)).

| # | Question | Why it matters | Related | Status | Answer |
|---|---|---|---|---|---|
| A1 | Is there an API to create compute groups and their join/attach credentials from code? `dcp-client` 5.9 has none that we could find. | Today groups are made by hand in the portal, so the demo needs a pre-made pool and hospitals need a manual onboarding step. An API would let the coordinator create a group when a site joins. | OQ9 | Asked | 2026-11-17: we cannot create groups ourselves (see above). Asked Alex to create `qmind-fl-1` to `qmind-fl-5` or say where to create them. |
| A2 | Can a job, or a single slice, be sent to one specific worker (e.g. by worker ID or identity) without a compute group per site? | If yes, we can drop the per-site compute groups entirely. | OQ9 | Open | |
| A3 | Can a site own its compute group and give our coordinator permission to attach jobs to it, without sharing the join secret? | Hospitals would keep control of what runs on their hardware, and we would not have to handle their secrets. | OQ9 | Open | |
| A4 | If one job's slices go to a compute group with N workers, is each worker guaranteed to get at least one slice? Can one worker take several slices at once? | Decides whether "one job per round with a slice per site" could replace "one job per site per round". Newton needs every site exactly once per round. | | Open | |
| A5 | Is there a limit on how many compute groups an account can create, or on how many jobs can attach to one group at the same time? | Many hospitals mean many groups and many jobs per round. | | Open | |

## Remote data and workers

| # | Question | Why it matters | Related | Status | Answer |
|---|---|---|---|---|---|
| A6 | Is `RemoteDataSet` with `http://localhost:<port>/...` URLs, fetched by a worker started with `--allow-origin http://localhost:<port>`, the intended way to keep data on the worker's machine? Is the URL or its contents ever seen by the scheduler? | This is the core privacy claim of the demo (R6/R7). Tested locally, not yet confirmed on DCP. | OQ12, OQ13 | Answered | 2026-11-16: Alex points to the [data-uri docs](https://docs.dcp.dev/advanced/data-uri.html), which describe this mechanism, but warns it may be hard before the showcase. Still not run end to end. |
| A7 | Does a worker started with `dcp-worker` 4.7.0 need its own DCP identity or keystore, or registration (`--register`), before it can join a compute group? | Decides what a teammate or hospital must set up before joining. | OQ9 | Answered | 2026-11-16/17: any worker can join a private group. Use `--join key,secret`, or a dcp.cloud registration key + credential list applied with `--register`. Registering only matters for earnings and portal management. |
| A8 | Is `dcp-evaluator-start -t node` acceptable for a demo on Windows laptops, or should participants install the native evaluator or the Windows screensaver? | The Node evaluator prints a "not for production" warning. | OQ7 | Open | 2026-11-17: the Node evaluator works for testing with the extra flags above. Production choice still to confirm. |
| A9 | Can a browser worker (e.g. dcp.work) read data the page provides, so joining could be one click in a browser with no terminal? | Would remove the agent install step for participants. | | Answered | 2026-11-16: yes, browser workers can join a private group (dcp.work, or an embedded worker). Reading local data needs CORS on the data server and `allowOrigins`. |
| A10 | Does the job `status` event reliably report when a worker picks up a slice (`distributed`)? | The live dashboard uses it to show a laptop starting work. It falls back to the result event if not. | | Open | |

## Trust and governance

| # | Question | Why it matters | Related | Status | Answer |
|---|---|---|---|---|---|
| A11 | Can a worker be limited to approved work functions (e.g. by code hash or signature), and not just to specific job IDs? | A hospital must trust our work function: it reads their rows and could return anything. Restricting by job ID (`dcp-worker -j`) does not fit, because we deploy new jobs every round. | OQ-LR5 | Open | |
| A12 | Can jobs be long-lived and receive new slices each round (e.g. `addSlices`) instead of being redeployed every round? | Would allow one job per site for the whole training run (fewer deploys) and could make A11 easier. | | Open | |
| A13 | What audit trail does DCP keep of which jobs ran on a worker and what results they returned? | Hospitals will ask for an audit log of everything that left the site. | OQ11 | Open | |
