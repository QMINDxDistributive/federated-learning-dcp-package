# DCP credentials: what each key is and where it goes

The demo uses a few kinds of DCP credentials. This page explains what each one is for, where to
get it, and where to put it. **Never commit any of them.** Keystores live outside the repo, and
`demo/devices.json` is gitignored.

## Summary

| Credential | What it does | Where you get it | Where it goes | Needed for |
|---|---|---|---|---|
| Identity keystore (`id.keystore`) | Proves to the scheduler who is deploying jobs | DCP portal → API keys | `~/.dcp/id.keystore` | Every DCP run |
| Bank account keystore (`default.keystore`) | Pays for jobs in DCC | DCP portal → Bank / Accounts | `~/.dcp/default.keystore` | Every DCP run (not `DCP_LOCAL_WORKER=1`) |
| API key (optional) | Replaces the identity keystore | DCP portal → API keys | `DCP_API_KEY` environment variable | Optional |
| Shared compute group (join key + secret) | One private group that every job is sent to | Distributive (Alex gave us one, 2026-11-17) | `sharedGroup` in `demo/devices.json`, or `DCP_ATTACH_KEY` / `DCP_ATTACH_SECRET` | DCP · data in job (optional), `npm run demo:worker` |
| Per-machine compute groups (join key + secret) | One private group per joining machine | Distributive creates them (we cannot, see below) | `computeGroups` in `demo/devices.json` | DCP · machines mode only |
| Registration key | Links a worker to your account, and tells it which groups to join | dcp.cloud → Workers → Registration keys | Run once on the worker: `dcp-worker --register=<key>[,label]` | Optional, worker side only |

`~/.dcp` means the `.dcp` folder in your home directory: `C:\Users\<you>\.dcp` on Windows,
`/Users/<you>/.dcp` on macOS, `/home/<you>/.dcp` on Linux.

## Which mode needs what

| Mode | Keystores (or API key) | Compute groups |
|---|---|---|
| Simulation | No | No |
| DCP · data in job | Yes | Optional: the shared group (`sharedGroup`). Without it, jobs go to the public network |
| DCP · machines | Yes | Yes, one per joining machine, in `demo/devices.json` |
| `npm run dcp:hello` | Yes | Optional: `DCP_ATTACH_KEY` / `DCP_ATTACH_SECRET` |

## Keystores (identity and bank account)

These are the two files every DCP run needs. Both are downloaded from the DCP portal
([dcp.cloud](https://dcp.cloud), formerly portal.distributed.computer) and are each locked with a
password you choose when downloading.

1. Log in to the portal.
2. Download an **API key keystore**, and save it as `~/.dcp/id.keystore`.
3. Download your **bank account keystore**, and save it as `~/.dcp/default.keystore`. The
   account needs DCC to pay for jobs.
4. Check that both files are there:

   ```sh
   ls ~/.dcp          # should list id.keystore and default.keystore
   ```

dcp-client may also create `identity-cache.json` and `localStorage` in that folder. Leave them.

**Entering the passwords:**

- **Dashboard** (`npm run demo`, `npm run demo:dcp-job`, `npm run demo:dcp`): pressing
  **Start training** in a DCP mode opens a dialog that asks for both passwords once. They unlock
  the keystores for that server session only, are sent only to the local demo server, and are
  never saved or logged.
- **Terminal** (`npm run dcp:hello`, `node demo/run.js --cli`): you are asked once for the
  identity password and once for the bank password, then every job reuses them
  (`src/runners/dcpInit.js`).

**Skipping the identity password:** set `DCP_API_KEY` to an API key from the portal. The identity
keystore is then not used, and only the bank password is asked for.

```powershell
$env:DCP_API_KEY = "<api key>"        # PowerShell, this terminal only
```
```sh
export DCP_API_KEY="<api key>"        # macOS / Linux
```

See also the [DCP setup guide](https://docs.dcp.dev/intro/getting-setup.html).

## Shared compute group (DCP · data in job mode)

Alex gave us one compute group. Because this mode sends each state's rows inside its job, any
worker can run any state's job, so one group is enough: every job goes to it, and whichever
worker in the group picks a job up runs it. Each state still gets its own job each round,
computed only on its rows. Later, DCP · machines mode moves to one group per machine.

1. Put the group in `demo/devices.json` (gitignored):

   ```json
   { "sharedGroup": { "joinKey": "<join key>", "joinSecret": "<join secret>" }, "computeGroups": [] }
   ```

   (`DCP_ATTACH_KEY` / `DCP_ATTACH_SECRET` override it, for one terminal.)
2. Start at least one worker in the group, or the jobs wait forever: a private group has no
   public workers.
   - This computer: `npm run demo:worker` (evaluator + worker in the shared group only).
   - Any other computer: open [dcp.work](https://dcp.work/) in a browser and set the compute
     group (join key and secret) in the top left. No install needed.
3. Run `npm run demo:dcp-job`, add states and press **Start training**. The status bar and
   activity log show the group's name.

Quick check before the demo: with the worker running, `npm run dcp:hello` sends five tiny jobs to
the group (it uses the same `DCP_ATTACH_KEY` / `DCP_ATTACH_SECRET`, so set those in that
terminal).

## Per-machine compute groups (DCP · machines mode)

A compute group is a private set of workers. A job attached to a group can only run on workers
that joined it. DCP · machines mode needs **one group per joining machine**, so each machine's job
can only run on that machine. See [why one compute group per machine](README.md#why-one-compute-group-per-laptop).

Each group has a **join key** (its name, e.g. `qmind-fl-1`) and a **join secret** (its password).

> [!IMPORTANT]
> As of 2026-11-17 we cannot create compute groups ourselves. dcp.cloud credential lists only
> store credentials for groups that already exist: adding a new key fails with
> `Insufficient information {} to identify compute group`. Distributive has to create them
> (question A1 in [questions for Alex](../specs/shared/questions-for-alex.md)).

**On the coordinator**, once you have the groups:

1. Copy `demo/devices.example.json` to `demo/devices.json` (gitignored).
2. Replace each `TODO` with a group's join key and secret:

   ```json
   {
     "computeGroups": [
       { "joinKey": "qmind-fl-1", "joinSecret": "<secret>" },
       { "joinKey": "qmind-fl-2", "joinSecret": "<secret>" }
     ]
   }
   ```

3. Restart the demo. The join panel shows "N of M groups free".

Each machine that joins is lent one group from this list, and the coordinator attaches that
machine's jobs to it. Machines that join get their group's credentials from the coordinator
automatically. They do not need to set anything up.

**One shared group instead:** set `DCP_ATTACH_KEY` and `DCP_ATTACH_SECRET` to one group's join key
and secret. In DCP · machines mode every machine then shares that group: it works, but jobs
sometimes land on the wrong machine and are retried. In DCP · data in job mode, this runs the jobs
in that group instead of the public network.

```powershell
$env:DCP_ATTACH_KEY = "qmind-fl-1"; $env:DCP_ATTACH_SECRET = "<secret>"
```

**Checking a group exists:** start a worker that joins only that group. If it reaches `* Ready.`
and stays running, the group is real. If it stops with `insufficient information to join compute
group`, it does not exist.

```sh
npx --yes -p dcp-worker@4.7.0 dcp-worker --no-global --join "qmind-fl-1,<secret>"
```

## Worker side: registration keys and credential lists (optional)

The demo agent (`demo/agent.js`) starts each machine's worker with `--join key,secret` directly, so
the steps below are **not needed for the demo**. They are the portal's way of managing workers,
and probably how real sites (e.g. hospitals) would be set up.

- **Credential list** (dcp.cloud → Workers): a named list of compute group credentials (join key +
  join secret). Use one list per group, so a worker registered with it joins only that group.
- **Registration key** (dcp.cloud → Workers): carries the bank account that receives the worker's
  earnings and the credential lists it should use.
- **Registering a worker:** run once on that machine. It then shows up in the portal, and joins
  the list's groups every time it starts (after a restart, if the list changes).

  ```sh
  npx --yes -p dcp-worker@4.7.0 dcp-worker --register=<registration key>,<label>
  ```

- **Checking what a worker will join:**

  ```sh
  npx --yes -p dcp-worker@4.7.0 dcp-worker --show=compute-groups
  ```

  `joinHash: ''` next to a group means its secret was not set.

An unregistered worker still works. Its earnings go to an "unclaimed earnings account" until you
register it.

## Troubleshooting

| Message | Meaning | Fix |
|---|---|---|
| `Wrong password for the identity (API key) keystore` | Wrong identity password | Re-enter it, or set `DCP_API_KEY` |
| `Wrong password for the bank account keystore` | Wrong bank password | Re-enter it |
| `No compute groups configured` (dashboard banner) | `demo/devices.json` missing or all `TODO` | Fill in `devices.json`, or use DCP · data in job mode |
| `Access Denied::Failed to add job ... to any of the desired compute groups` | The job's group credentials were rejected | Check the key and secret, and that the group exists |
| `insufficient information to join compute group` (worker) | The group does not exist, or its secret is empty | Ask Distributive to create it; check `--show=compute-groups` |
| `spawn bin\dcp-evaluator ENOENT` | `dcp-evaluator-start -t node` alone looks for the native evaluator | Use `demo/agent.js`, which passes the Node evaluator's paths (see [questions for Alex](../specs/shared/questions-for-alex.md)) |
