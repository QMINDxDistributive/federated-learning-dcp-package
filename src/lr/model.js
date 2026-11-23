'use strict';

const { sigmoid } = require('./math');

/** Convert standardized coefficients to the original feature scale and build the export object. */
function exportModel({ betaStd, stats, h, training }) {
  const off = h.fitIntercept ? 1 : 0;
  const p = stats.featureNames.length;
  const coefficients = new Array(p);
  let intercept = off ? betaStd[0] : 0;
  for (let j = 0; j < p; j++) {
    const w = betaStd[j + off];
    coefficients[j] = w / stats.std[j];
    intercept -= (w * stats.mean[j]) / stats.std[j];
  }
  return {
    formatVersion: 1,
    modelType: 'logistic-regression',
    featureNames: stats.featureNames,
    intercept,
    coefficients,
    standardization: { mean: stats.mean, std: stats.std },
    training: {
      method: h.method,
      hyperparameters: h,
      classWeights: stats.classWeights,
      warnings: stats.warnings,
      ...training,
      trainedAt: new Date().toISOString(),
    },
  };
}

/** Inference needs no dependencies and no standardization stats. */
function predictProba(model, x) {
  let z = model.intercept;
  for (let j = 0; j < x.length; j++) z += model.coefficients[j] * x[j];
  return sigmoid(z);
}

module.exports = { exportModel, predictProba };
