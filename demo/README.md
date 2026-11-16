# Showcase demo: federated arthritis model on DCP

Five US states each hold their own BRFSS 2024 survey rows. Federated Newton-style logistic
regression trains one arthritis-risk model across them on DCP, and the result matches
scikit-learn trained on all the rows pooled together.

## Run it

```sh
npm install
npm test               # includes the federated vs scikit-learn check (1e-6)
npm run demo           # dashboard at http://localhost:3000 (pick DCP or Local in the page)
npm run demo:dcp       # same, DCP selected by default
node demo/run.js --cli # terminal only, local; add --dcp for DCP
npm run dcp:hello      # DCP smoke test: one job per site, returns row counts
```

DCP credentials ([setup guide](https://docs.dcp.dev/intro/getting-setup.html)): create an API key
in the portal's Keys tab (purpose "Job Creation", linked to a funded bank account) and set it as
`DCP_API_KEY`. Keystore files in `~/.dcp/` also work. To target a compute group, set
`DCP_ATTACH_KEY` and `DCP_ATTACH_SECRET` (jobs attach to a group; workers join it). Never commit keys or keystores.

## Rebuild the data (optional)

The per-state files in `demo/data/sites/` are committed. To rebuild them:

```sh
python -m venv demo/.venv && demo/.venv/Scripts/pip install pandas numpy scikit-learn
curl -O https://www.cdc.gov/brfss/annual_data/2024/files/LLCP2024XPT.zip   # unzip into demo/data/raw/
demo/.venv/Scripts/python tools/brfss/prepare.py demo/data/raw/LLCP2024.XPT demo/data/sites
demo/.venv/Scripts/python tools/reference/sklearn_reference.py demo/data/sites test/fixtures/brfss-reference.json
```

Python is test and data tooling only. The package and the DCP work function have no Python
and no npm dependencies other than `dcp-client`.

## What talks to what

- `src/lr/workFunction.js` runs on DCP workers. Self-contained by design (it is shipped as
  source). Returns only aggregates: gradient, Hessian, loss and row count.
- `src/lr/coordinator.js` round 0 standardization and checks, then the Newton update.
- `src/lr/train.js` the training loop (Alex's `trainModelOnDcp`).
- `src/runners/local.js` and `src/runners/dcp.js` the same loop, in-process or one DCP job
  per site per round.

In v0.1 each site's rows travel inside its DCP slice (decision 0001), so do not say "the data
never leaves the state". Say the algorithm only needs aggregates, and v0.2 remote data will
keep rows at each site.
