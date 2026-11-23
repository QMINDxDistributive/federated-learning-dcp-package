'use strict';

/**
 * DCP hello world: one job per site, each slice returns its row count.
 * Checks credentials, worker availability and result delivery, and measures latency.
 *
 *   npm run dcp:hello
 *   Credentials: set DCP_API_KEY (portal Keys tab), or keystores in ~/.dcp.
 *   Optional compute group: DCP_ATTACH_KEY and DCP_ATTACH_SECRET.
 *   DCP_LOCAL_WORKER=1 runs the jobs on a worker in this process (job.localExec).
 */

const { loadSites } = require('./sites');
const { runSingleSliceJob } = require('../src/runners/dcpJob');

async function main() {
  const localWorker = process.env.DCP_LOCAL_WORKER === '1';
  const { compute, paymentKeystore } = await require('../src/runners/dcpInit').initDcp({ needPayment: !localWorker });
  const sites = loadSites();
  const groups = process.env.DCP_ATTACH_KEY
    ? [{ attachKey: process.env.DCP_ATTACH_KEY, attachSecret: process.env.DCP_ATTACH_SECRET }]
    : undefined;

  const dccPerSlice = Number(process.env.DCP_DCC_PER_SLICE) || 1;
  console.log(`Scheduler: ${dcpConfig.scheduler.location.href}`);
  if (!localWorker) console.log(`Price: ${dccPerSlice} DCC per slice, at most ${dccPerSlice * sites.length} DCC for this run (${sites.length} one-slice jobs)`);
  console.log(`Compute group: ${groups ? groups[0].attachKey : 'public'}${localWorker ? ' (local worker via localExec)' : ''}`);

  const t0 = Date.now();
  const outcomes = await Promise.allSettled(
    sites.map(async (site) => {
      const job = compute.for([{ rows: site.data.X.length, site: site.name }], (d) => {
        progress(1);
        return { site: d.site, rows: d.rows };
      });
      job.public.name = `hello ${site.name}`;
      if (groups) job.computeGroups = groups;
      let source = '';
      const r = await runSingleSliceJob(job, {
        dccPerSlice,
        paymentKeystore,
        localWorker,
        timeoutMs: 120 * 1000,
        onAccepted: ({ id }) => console.log(`  ${site.name}: accepted ${id} at ${Date.now() - t0} ms`),
        onSource: (s) => { source = s; },
      });
      const ms = Date.now() - t0;
      console.log(`  ${site.name}: ${r.rows} rows after ${ms} ms (via ${source})`);
      return ms;
    })
  );
  const ok = outcomes.filter((o) => o.status === 'fulfilled').map((o) => o.value);
  outcomes.forEach((o, k) => o.status === 'rejected' && console.log(`  ${sites[k].name}: FAILED: ${o.reason.message}`));
  console.log(`${ok.length}/${sites.length} results in; slowest ${ok.length ? Math.max(...ok) : '-'} ms`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
