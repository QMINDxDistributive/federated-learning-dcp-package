'use strict';

/**
 * Run a one-slice DCP job and return its single result as soon as it exists.
 *
 * Why not just `await job.exec()`: exec() resolves on the job's 'complete' event, and in our
 * runs that sometimes came late or never, even though the portal showed the job finished and
 * the 'result' event had already arrived. Pushed 'result' events can also go missing. So we
 * take whichever comes first:
 *   1. the pushed 'result' event,
 *   2. polling the scheduler's result service with job.results.fetch() every pollMs,
 *   3. exec() resolving.
 * We fail fast on the events the Compute API documents as fatal for us: 'nofunds' (job paused
 * for lack of credits), 'error' (the work function threw), 'cancel'.
 *
 * Payment: a fixed numeric offer in DCC per slice. exec() with no price uses compute.marketValue,
 * which has no per-slice ceiling, so a fixed offer is the only way to cap cost
 * (https://docs.dcp.dev/api/compute/classes/job.html). 1 DCC per slice is the price the team
 * measured as accepted by public workers (QMIND-Distributive-Testing, TESTING.md).
 */
function runSingleSliceJob(job, { dccPerSlice, paymentKeystore = null, localWorker = false, timeoutMs, pollMs = 3000, onAccepted = () => {}, onStatus = () => {}, onSource = () => {} }) {
  if (!localWorker && !(typeof dccPerSlice === 'number' && dccPerSlice > 0)) {
    throw new Error('dccPerSlice must be a positive number (a fixed price caps the cost)');
  }
  return new Promise((resolve, reject) => {
    let done = false;
    let pollTimer = null;
    let deployed = false;

    const finish = (err, value, source) => {
      if (done) return;
      done = true;
      if (!err) onSource(source);
      clearTimeout(timeoutTimer);
      clearInterval(pollTimer);
      if (err) {
        Promise.resolve()
          .then(() => job.cancel('client gave up on this job'))
          .catch(() => {});
        reject(err);
      } else {
        resolve(value);
      }
    };

    const timeoutTimer = setTimeout(() => finish(new Error(`no result after ${timeoutMs} ms`)), timeoutMs);

    job.on('accepted', (ev) => {
      deployed = true;
      onAccepted(ev);
    });
    job.on('status', (ev) => onStatus(ev)); // { runStatus, total, distributed, computed }
    job.on('result', (ev) => finish(null, ev.result, 'result event'));
    job.on('nofunds', () => finish(new Error('job paused: not enough credits in the payment account (ENOFUNDS)')));
    job.on('error', (ev) => finish(new Error(`work function failed: ${ev && (ev.message || ev.error || JSON.stringify(ev))}`)));
    job.on('cancel', (ev) => finish(new Error(`job cancelled by scheduler: ${(ev && (ev.reason || ev.code)) || 'no reason given'}`)));

    // Fallback: ask the result service directly in case the pushed event never arrives.
    pollTimer = setInterval(async () => {
      if (done || !(deployed || job.address)) return; // job.address exists once deployed
      try {
        await job.results.fetch();
        const values = job.results.values();
        if (values.length > 0) finish(null, values[0], 'polling');
      } catch (_) {
        /* not available yet */
      }
    }, pollMs);

    const run = localWorker ? job.localExec(1) : job.exec(dccPerSlice, paymentKeystore || undefined);
    run.then(
      (results) => {
        const values = Array.from(results);
        if (values.length > 0) finish(null, values[0], 'exec');
      },
      (err) => finish(err)
    );
  });
}

module.exports = { runSingleSliceJob };
