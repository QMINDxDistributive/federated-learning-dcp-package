# Showcase demo: one arthritis model, many laptops, no pooled data

This computer is the **coordinator**. Any number of other laptops join by scanning a QR code or
opening a link, and each one brings its own dataset. Federated Newton-style logistic
regression trains one arthritis-risk model across them on DCP. Each laptop's rows are read only
by the DCP worker on that laptop. Only model numbers (weights out; gradient, Hessian and loss
back) cross the network.

The dashboard is a live system view, with a join link and QR code always on screen:

- Laptops appear in the diagram as they join and go grey if they drop off.
- During training you can watch the weights go out and the aggregates come back, each laptop
  read its own rows locally, and the weights change round by round.
- A results popup at the end compares the federated model with each dataset alone and with
  pooled scikit-learn, and summarizes the run.

## Run it

DCP modes need credentials: see [DCP credentials](dcp-credentials.md) for what each key is and
where it goes. Simulation needs none.

```sh
npm install
npm test               # includes the federated vs scikit-learn check (1e-6)
npm run demo           # dashboard at http://localhost:3000 (this computer only)
npm run demo:dcp       # same, DCP mode selected
node demo/run.js --cli # terminal only: simulation with the five sample states
```

The dashboard has three modes:

| Mode | Where it computes | Where the rows are | Needs |
|---|---|---|---|
| **DCP · machines** | each joined laptop's DCP worker | stay on each laptop | one compute group per laptop (below) |
| **DCP · data in job** | any DCP worker (public network, or the group in `DCP_ATTACH_KEY`) | sent inside each DCP job | DCP credentials only |
| **Simulation** | this computer | this computer | nothing |

**Simulation** mode: press **+ Add machine** in the join panel as many times as you
like, then **Start training**. Everything runs on this computer with the same events and
pacing as a real run. Use it to rehearse.

**DCP · data in job** (`npm run demo:dcp-job`): press **+ Add state**, then **Start training**.
This is real DCP: one job per state per round, paid in DCC. Each state's rows travel inside its job
(decision 0001), so no compute groups are needed. This is Alex's advice for the showcase (see
[questions for Alex](../specs/shared/questions-for-alex.md)): show federated training on DCP
working, and say that in a real deployment the rows would stay on each site, which is what
**DCP · machines** does. The dashboard and the results popup say this, and the run stats
include the rows sent.

## DCP across laptops (decision 0004)

```
 coordinator (this computer)          DCP scheduler                    joined laptop (any number)
 npm run demo  ── job: β + URL ──▶  routes to that laptop's  ──▶  DCP worker (in that laptop's
               ◀── ∇, H, loss ───   compute group           ◀──   compute group only)
      ▲                                                             │ fetch localhost:<port>
      └──────── join, heartbeats (name, row count, no rows) ──────  fl-agent.js (rows stay here)
```

### Why one compute group per laptop

> [!IMPORTANT]
> DCP training across laptops needs **one DCP compute group for each laptop that joins**,
> listed in `demo/devices.json`. Without them, laptops can join the dashboard, but only
> Simulation and DCP · data in job can train. As of 2026-11-17 we cannot create groups
> ourselves: dcp.cloud credential lists only store credentials for groups that already exist.
> Distributive has to create them (see A1 in
> [questions for Alex](../specs/shared/questions-for-alex.md)).

- Your DCP password (keystore) decides who deploys and pays for jobs. It does not decide
  which computer runs them. By default any public DCP worker can pick up a job.
- Before decision 0004, that was fine: each job carried its state's rows, so any machine
  could run it. Now the rows stay on each laptop, and a job only says "read
  `localhost:<port>` on this machine". The Alaska job therefore has to run on the Alaska
  laptop.
- A compute group is DCP's only way to limit which workers run a job. If each laptop's
  worker is the only member of its group, its jobs can only run there.
- One shared group is not enough. DCP picks which member takes each job, so the Alaska
  job would often land on another laptop, fail and be retried.
- It cannot be one job with a slice per laptop either. DCP hands slices to whichever
  workers ask first, so one laptop could get two slices and another none. Newton needs every
  laptop exactly once per round.
- The groups are a reusable pool, not per person. Create them once (e.g. 8), and any
  laptop that joins borrows a free one, which goes back to the pool when it leaves. dcp-client
  has no API to create groups, so this is a manual step for now.

Hospitals would each have their own long-lived group, which also acts as their consent: their
worker runs nothing that isn't attached to it. Ways to remove the manual step are in
[questions for Alex](../specs/shared/questions-for-alex.md) (A1–A5).

### One-time setup on the coordinator

1. **Compute groups.** Each laptop that joins needs its own DCP compute group, so its jobs can
   only run on it. Get a pool of them from Distributive (we cannot create them ourselves; see above; dcp-client has no API to create
   groups), one per laptop you expect, plus spares. Copy `demo/devices.example.json` to
   `demo/devices.json` (gitignored) and list them. The pool size is the most laptops that can
   join at once; add groups to allow more. As a fallback, `DCP_ATTACH_KEY` and
   `DCP_ATTACH_SECRET` give every laptop one shared group. That works, but a job may land on
   the wrong laptop first and be retried.
2. **Credentials.** Set `DCP_API_KEY`, or put the keystores in `~/.dcp/` (the dashboard asks
   for their passwords). See [DCP credentials](dcp-credentials.md) for what each key is, where
   to get it and where to put it. Never commit keys or keystores.
3. **Network.** The laptops must be able to reach this computer, e.g. on the same Wi-Fi. The
   server listens on all interfaces (`HOST`, default `0.0.0.0`). Windows may ask whether to
   allow Node through the firewall; allow it on private networks. If this computer has several
   network addresses, use **Other address** in the join panel. `PUBLIC_URL` overrides the
   address entirely, e.g. for a tunnel.

### Joining from a laptop

1. Scan the QR code or open the join link.
2. Pick the data: a demo sample state, or your own JSON file.
3. Run the one command the page shows (Node.js 20+ needed). For example, on Windows:

   ```powershell
   irm http://192.168.2.54:3000/join/agent.js -OutFile fl-agent.js; node fl-agent.js http://192.168.2.54:3000 <token> --sample florida
   ```

The agent (`demo/agent.js`, a single file using only Node built-ins) then:

- serves the data at `http://localhost:<free port>/data.json`, bound to 127.0.0.1, so no other
  machine can read it;
- registers with the coordinator, sending a name, the row count and the feature names, never
  the rows. The coordinator rejects data whose features don't match the model;
- gets one compute group from the pool;
- starts a DCP evaluator and worker (`npx -p dcp-worker@4.7.0 ...`) that joins only that group
  (`--join`, `--no-global`) and may only fetch its own port (`--allow-origin`);
- sends a heartbeat every 5 seconds. Ctrl+C leaves the session and frees the group. A laptop
  that stops sending heartbeats shows as offline after about 15 seconds.

`--sample <state>` is demo setup: the first run saves that state's sample file into the folder,
and later runs read it from there. Do it before the presentation. In real use, pass
`--data <file>` instead.

The evaluator runs in Node mode, which `dcp-worker` warns is not
for production. `dcp-evaluator-start -t node` alone fails on an npx install (it still looks for
the native binary), so the agent passes node and dcp-client's `evaluator-node.js` explicitly. That is fine for a demo; for anything else, install the native evaluator or
the Distributive screensaver.

### Training

Press **Start training** once at least two laptops are online. The run uses the laptops online
at that moment. Laptops that join mid-run appear when it finishes. The coordinator never opens a
laptop's data. Each round it sends one job per laptop, carrying the current weights and the
laptop's localhost URL as DCP remote data, attached to that laptop's compute group.

How the system protects the data:

- Each data server only answers on its own laptop, so a job can only read rows from the
  machine it lands on.
- Compute groups make sure each job lands on the right machine.
- If a job still reaches the wrong laptop, the work function's site check refuses to train on
  that laptop's data, and the job is retried.

## Network exposure

| Reachable from | Paths |
|---|---|
| This computer only | `/` dashboard, `/config`, `/events`, training and simulation controls |
| The LAN | `/join` page, `/join/agent.js`, `/join/samples` and `/join/sample/*` (need the session token), `/api/join`, `/api/heartbeat`, `/api/leave` |

The join token changes every time the coordinator restarts, so old links stop working. Compute
group secrets travel to the agents over plain HTTP on the LAN. That is acceptable for a
classroom demo, but not for real data.

## Rebuild the data (optional)

The sample files in `demo/data/sites/` and `demo/data/baselines.json` are committed. To
rebuild them:

```sh
python -m venv demo/.venv && demo/.venv/Scripts/pip install pandas numpy scikit-learn
curl -O https://www.cdc.gov/brfss/annual_data/2024/files/LLCP2024XPT.zip   # unzip into demo/data/raw/
demo/.venv/Scripts/python tools/brfss/prepare.py demo/data/raw/LLCP2024.XPT demo/data/sites
demo/.venv/Scripts/python tools/reference/sklearn_reference.py demo/data/sites test/fixtures/brfss-reference.json
npm run demo:baselines   # "each state alone" scores for the results popup
```

Python is test and data tooling only. The package and the DCP work function have no Python
and no npm dependencies other than `dcp-client`. The dashboard loads a QR code library from a
CDN; without internet it shows the link only.

## What talks to what

- `src/lr/workFunction.js` runs on DCP workers. It is self-contained by design, because it is
  shipped as source. It returns only aggregates (gradient, Hessian, loss, row count) plus site
  and device labels.
- `src/lr/coordinator.js` handles round 0 standardization and checks, then the Newton update.
- `src/lr/train.js` is the training loop.
- `src/runners/dcp.js` deploys one DCP job per site per round. Each site either has `dataUrl`
  (remote data, decision 0004) or `data` (rows in the slice, decision 0001). `withSites()`
  reuses one unlocked DCP session for a changing set of laptops.
- `demo/agent.js` is the per-laptop data server, registration and worker launcher.
- `demo/participants.js` tracks who joined: join tokens, the compute-group pool, heartbeats
  and feature checks.
- `demo/run.js` is the coordinator server. `demo/dashboard/index.html` is the live view, and
  `demo/dashboard/join.html` is the join page.

What to say: in DCP mode, training rows never leave their laptop. The coordinator holds only a
held-out test set (`test.json`) to score the final model. The "each state alone" scores were
computed once, offline, by `demo/baselines.js`, and appear for laptops using a sample state.
The scikit-learn comparison only applies when the five sample states each take part once.
