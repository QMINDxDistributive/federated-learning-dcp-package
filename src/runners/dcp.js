'use strict';

const { workFunction } = require('../lr/workFunction');
const { runSingleSliceJob } = require('./dcpJob');

/**
 * DCP runner: one DCP job per site per round, all sites deployed together (LR spec,
 * "DCP job design"). In v0.1 each job's single slice carries that site's rows (decision 0001).
 *
 * Credentials: see dcpInit.js (DCP_API_KEY, or keystores in ~/.dcp).
 * Compute groups: pass computeGroups ([{ attachKey, attachSecret }]), or set DCP_ATTACH_KEY and
 * DCP_ATTACH_SECRET. Jobs "attach" to a compute group; workers "join" it. dcp-client 5.9
 * still accepts joinKey/joinSecret on jobs but warns that they are deprecated (DCP_DEP003). A per-site
 * group (site.computeGroups) targets that site's private workers, as agreed with Alex.
 *
 * sites: [{ name, data, computeGroups? }]
 * localWorker: true runs each job on a worker inside this process via job.localExec(). The job
 *              still goes through the DCP scheduler, costs nothing, and needs no public workers.
 *              Also enabled by DCP_LOCAL_WORKER=1.
 * dccPerSlice: fixed price per slice in DCC (default 1, or DCP_DCC_PER_SLICE). Each job has one
 *              slice, so a training run costs about sites x (1 + rounds) x dccPerSlice, plus retries.
 * passphrases: optional { identity, payment } to unlock the keystores without a terminal prompt.
 * onSiteEvent: optional ({ site, round, stage, type: 'deployed'|'accepted'|'result'|'retry', ... })
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

  const { compute, paymentKeystore } = await require('./dcpInit').initDcp({ needPayment: !localWorker, passphrases });

  async function runSiteOnce(site, args, round) {
    const job = compute.for([site.data], workFunction, [args]);
    job.public.name = `${jobName} ${args.stage} r${round} ${site.name}`;
    const groups = site.computeGroups || computeGroups;
    if (groups) job.computeGroups = groups;
    onSiteEvent({ site: site.name, round, stage: args.stage, type: 'deployed' });
    return runSingleSliceJob(job, {
      dccPerSlice,
      paymentKeystore,
      localWorker,
      timeoutMs: roundTimeoutMs,
      onAccepted: ({ id }) => onSiteEvent({ site: site.name, round, stage: args.stage, type: 'accepted', jobId: id }),
    });
  }

  async function runSite(site, args, round) {
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await runSiteOnce(site, args, round);
        onSiteEvent({ site: site.name, round, stage: args.stage, type: 'result', ms: Date.now() - started });
        return result;
      } catch (err) {
        if (attempt >= maxRoundRetries) {
          throw new Error(`Site "${site.name}" failed round ${round} (${args.stage}) after ${attempt + 1} attempts: ${err.message}`);
        }
        onSiteEvent({ site: site.name, round, stage: args.stage, type: 'retry', attempt: attempt + 1, error: err.message });
      }
    }
  }

  return {
    mode: localWorker ? 'dcp-local-worker' : 'dcp',
    dccPerSlice,
    siteNames: sites.map((s) => s.name),
    runRound(stage, args, round) {
      return Promise.all(sites.map((s) => runSite(s, args, round)));
    },
  };
}

function defaultComputeGroups() {
  const attachKey = process.env.DCP_ATTACH_KEY;
  if (!attachKey) return undefined;
  return [{ attachKey, attachSecret: process.env.DCP_ATTACH_SECRET }];
}

module.exports = { createDcpRunner };
