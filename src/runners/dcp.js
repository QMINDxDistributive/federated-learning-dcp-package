'use strict';

const { workFunction } = require('../lr/workFunction');
const { runSingleSliceJob } = require('./dcpJob');

/**
 * DCP runner: one DCP job per site per round, all sites deployed together (LR spec,
 * "DCP job design").
 *
 * Where a site's rows come from:
 *   - site.dataUrl (decision 0004): the slice is a DCP remote data URL on the site's own machine,
 *     e.g. http://localhost:7071/data.json. The worker on that machine fetches it, so rows never
 *     go through DCP. The site's worker must allow that origin (dcp-worker --allow-origin) and be
 *     the only worker in the site's compute group (site.computeGroups), so the job cannot land on
 *     another machine. args.site is checked against the data by the work function as a backstop.
 *   - site.data (decision 0001): the rows travel inside the slice.
 *
 * Credentials: see dcpInit.js (DCP_API_KEY, or keystores in ~/.dcp).
 * Compute groups: site.computeGroups per site, else options.computeGroups, else DCP_ATTACH_KEY and
 * DCP_ATTACH_SECRET. Jobs "attach" to a compute group; workers "join" it.
 *
 * sites: [{ name, data?, dataUrl?, computeGroups? }]
 * localWorker: true runs each job on a worker inside this process via job.localExec(). Also
 *              enabled by DCP_LOCAL_WORKER=1.
 * dccPerSlice: fixed price per slice in DCC (default 1, or DCP_DCC_PER_SLICE). Each job has one
 *              slice, so a training run costs about sites x (1 + rounds) x dccPerSlice, plus retries.
 * passphrases: optional { identity, payment } to unlock the keystores without a terminal prompt.
 * The returned runner has withSites(sites), which returns a runner for a different set of sites
 * that reuses this DCP session (keystores stay unlocked), for sessions where sites come and go.
 * onSiteEvent: optional ({ site, round, stage, type, ... }) where type is
 *              'deployed'     job sent to the scheduler (bytes: size of the args sent)
 *              'accepted'     scheduler accepted the job (jobId)
 *              'distributed'  a worker picked up the slice
 *              'result'       result back (bytes, device, ms)
 *              'retry'        attempt failed, redeploying (attempt, error)
 */
async function createDcpRunner(sites, options = {}) {
  const {
    computeGroups = defaultComputeGroups(),
    roundTimeoutMs = 60 * 1000, // per attempt; a slice that takes longer is redeployed
    maxRoundRetries = 2,
    jobName = 'federated-lr',
    onSiteEvent = () => {},
    localWorker = process.env.DCP_LOCAL_WORKER === '1',
    dccPerSlice = Number(process.env.DCP_DCC_PER_SLICE) || 1,
    passphrases = null,
  } = options;

  checkSites(sites);
  const { compute, paymentKeystore } = await require('./dcpInit').initDcp({ needPayment: !localWorker, passphrases });

  function sliceInput(site) {
    if (site.data) return [site.data];
    return new compute.RemoteDataSet([site.dataUrl]);
  }

  const dataBytesOf = new WeakMap(); // rows sent inside the slice (0001 path), measured once per site
  function dataBytes(site) {
    if (!site.data) return 0;
    if (!dataBytesOf.has(site)) dataBytesOf.set(site, JSON.stringify(site.data).length);
    return dataBytesOf.get(site);
  }

  async function runSiteOnce(site, args, round) {
    const siteArgs = site.dataUrl ? { ...args, site: site.name } : args;
    const job = compute.for(sliceInput(site), workFunction, [siteArgs]);
    job.public.name = `${jobName} ${args.stage} r${round} ${site.name}`;
    const groups = site.computeGroups || computeGroups;
    if (groups) job.computeGroups = groups;
    const base = { site: site.name, round, stage: args.stage };
    // bytes: everything sent in the job, including rows when they travel in the slice (dataBytes).
    const db = dataBytes(site);
    onSiteEvent({ ...base, type: 'deployed', bytes: JSON.stringify(siteArgs).length + db, dataBytes: db, remote: Boolean(site.dataUrl) });
    let distributed = false;
    // Status events can arrive after the result; once the job is settled, report no more pick-ups.
    const settle = () => { distributed = true; };
    return runSingleSliceJob(job, {
      dccPerSlice,
      paymentKeystore,
      localWorker,
      timeoutMs: roundTimeoutMs,
      onAccepted: ({ id }) => onSiteEvent({ ...base, type: 'accepted', jobId: id }),
      onStatus: (status) => {
        if (!distributed && status && status.distributed > 0) {
          distributed = true;
          onSiteEvent({ ...base, type: 'distributed' });
        }
      },
    }).finally(settle);
  }

  async function runSite(site, args, round) {
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await runSiteOnce(site, args, round);
        onSiteEvent({
          site: site.name,
          round,
          stage: args.stage,
          type: 'result',
          ms: Date.now() - started,
          bytes: JSON.stringify(result).length,
          device: (result && result.device) || null,
          n: result && result.n,
          sourceBytes: (result && result.sourceBytes) || null,
        });
        return result;
      } catch (err) {
        if (attempt >= maxRoundRetries) {
          throw new Error(`Site "${site.name}" failed round ${round} (${args.stage}) after ${attempt + 1} attempts: ${err.message}`);
        }
        onSiteEvent({ site: site.name, round, stage: args.stage, type: 'retry', attempt: attempt + 1, error: err.message });
      }
    }
  }

  function forSites(list) {
    checkSites(list);
    return {
      mode: localWorker ? 'dcp-local-worker' : 'dcp',
      dccPerSlice,
      siteNames: list.map((s) => s.name),
      runRound(stage, args, round) {
        return Promise.all(list.map((s) => runSite(s, args, round)));
      },
      withSites: forSites,
    };
  }
  return forSites(sites);
}

function checkSites(sites) {
  for (const s of sites) {
    if (!s.data === !s.dataUrl) throw new Error(`Site "${s.name}" needs exactly one of data or dataUrl`);
  }
}

function defaultComputeGroups() {
  const attachKey = process.env.DCP_ATTACH_KEY;
  if (!attachKey) return undefined;
  return [{ attachKey, attachSecret: process.env.DCP_ATTACH_SECRET }];
}

module.exports = { createDcpRunner };
