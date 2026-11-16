'use strict';

const { resolveHyperparameters } = require('./hyperparameters');
const { processStats, initialNewtonState, newtonUpdate, validateResult } = require('./coordinator');
const { exportModel } = require('./model');

/**
 * Train a federated logistic regression model (Alex's trainModelOnDcp loop).
 *
 * runner: { siteNames: string[], runRound(stage, args, round) => Promise<result[]> }
 *         Results come back in siteNames order. createLocalRunner runs everything in this
 *         process; createDcpRunner deploys one DCP job per site per round.
 * onEvent: optional callback for progress ({ type: 'stats' | 'round' | 'done', ... }).
 */
async function train({ runner, hyperparameters = {}, onEvent = () => {} }) {
  const h = resolveHyperparameters(hyperparameters);
  const siteNames = runner.siteNames;
  if (h.minParticipants !== null && h.minParticipants !== siteNames.length) {
    throw new Error('Partial participation is not implemented yet; leave minParticipants unset');
  }

  // Round 0: stats
  const t0 = Date.now();
  const rawStats = await runner.runRound('stats', { stage: 'stats' }, 0);
  rawStats.forEach((r, k) => validateResult(r, 'stats', { site: siteNames[k] }));
  const stats = processStats(siteNames, rawStats, h);
  onEvent({
    type: 'stats',
    durationMs: Date.now() - t0,
    sites: siteNames.map((name, k) => ({ name, n: rawStats[k].n, classCounts: rawStats[k].classCounts })),
    N: stats.N,
    featureNames: stats.featureNames,
    warnings: stats.warnings,
  });

  let state = initialNewtonState(stats.d, h);
  const lossHistory = [];
  let converged = false;
  let rounds = 0;

  for (let t = 1; t <= h.maxRounds; t++) {
    const tr = Date.now();
    const args = {
      stage: 'newton',
      round: t,
      beta: state.beta,
      mean: stats.mean,
      std: stats.std,
      classWeights: stats.classWeights,
      fitIntercept: h.fitIntercept,
    };
    const results = await runner.runRound('newton', args, t);
    results.forEach((r, k) => validateResult(r, 'newton', { site: siteNames[k], n: rawStats[k].n, d: stats.d }));

    const betaEvaluated = state.beta;
    const u = newtonUpdate(state, results, h);
    state = u.state;
    rounds = t;
    lossHistory.push(u.loss);
    onEvent({
      type: 'round',
      round: t,
      loss: u.loss,
      maxStep: u.maxStep,
      rejected: u.rejected,
      converged: u.converged,
      beta: betaEvaluated,
      betaNext: state.beta, // standardized weights after this round's update; sent in the next round
      durationMs: Date.now() - tr,
      siteLoss: results.map((r) => r.loss),
    });
    if (u.converged) {
      converged = true;
      break;
    }
  }

  const model = exportModel({
    betaStd: state.beta,
    stats,
    h,
    training: {
      rounds,
      converged,
      finalLoss: lossHistory[lossHistory.length - 1],
      lossHistory,
      participation: Array.from({ length: rounds }, () => siteNames),
    },
  });
  onEvent({ type: 'done', model });
  return model;
}

module.exports = { train };
