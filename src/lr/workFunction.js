'use strict';

/**
 * Logistic regression work function: what one site computes in one round.
 *
 * This function is shipped to DCP workers as source text (Function.prototype.toString), so it
 * must be fully self-contained: no closures over module scope, no require(), no helpers
 * defined outside it. The same function is called directly by the local runner and the tests,
 * so what we test is exactly what runs on DCP.
 *
 * sliceData: { X: number[][] (raw, unstandardized rows), y: (0|1)[], featureNames: string[] }
 *            In v0.1 the rows travel with the slice (decision 0001).
 * args:      { stage: 'stats' | 'newton', beta, mean, std, classWeights, fitIntercept }
 *
 * Every result is an aggregate over all of the site's rows. No row-level data is returned.
 */
function workFunction(sliceData, args) {
  // DCP provides a global progress(); elsewhere it does not exist.
  var reportProgress = typeof progress === 'function' ? progress : function () {};

  var X = sliceData.X;
  var y = sliceData.y;
  var n = X.length;
  var p = n > 0 ? X[0].length : 0;

  if (args.stage === 'stats') {
    var sum = new Array(p).fill(0);
    var sumSq = new Array(p).fill(0);
    var classCounts = [0, 0];
    for (var i = 0; i < n; i++) {
      var row = X[i];
      for (var j = 0; j < p; j++) {
        sum[j] += row[j];
        sumSq[j] += row[j] * row[j];
      }
      classCounts[y[i] === 1 ? 1 : 0] += 1;
    }
    reportProgress(1);
    return { stage: 'stats', n: n, sum: sum, sumSq: sumSq, classCounts: classCounts, featureNames: sliceData.featureNames };
  }

  if (args.stage === 'newton') {
    var beta = args.beta;
    var mean = args.mean;
    var std = args.std;
    var cw = args.classWeights;
    var off = args.fitIntercept ? 1 : 0;
    var d = p + off;

    var gradient = new Array(d).fill(0);
    var hessian = new Array((d * (d + 1)) / 2).fill(0); // upper triangle, row-major
    var loss = 0;
    var x = new Array(d);

    for (var r = 0; r < n; r++) {
      if (off) x[0] = 1;
      for (var k = 0; k < p; k++) x[k + off] = (X[r][k] - mean[k]) / std[k];

      var z = 0;
      for (var a = 0; a < d; a++) z += beta[a] * x[a];

      var label = y[r] === 1 ? 1 : 0;
      var c = cw[label];
      // Stable sigmoid and log loss: loss = log(1 + e^z) - y z
      var prob, softplus;
      if (z >= 0) {
        var e = Math.exp(-z);
        prob = 1 / (1 + e);
        softplus = z + Math.log1p(e);
      } else {
        var e2 = Math.exp(z);
        prob = e2 / (1 + e2);
        softplus = Math.log1p(e2);
      }
      loss += c * (softplus - label * z);

      var resid = c * (prob - label);
      var w = c * prob * (1 - prob);
      var idx = 0;
      for (var a2 = 0; a2 < d; a2++) {
        gradient[a2] += resid * x[a2];
        var wx = w * x[a2];
        for (var b = a2; b < d; b++) hessian[idx++] += wx * x[b];
      }
      if (r % 500 === 0) reportProgress(r / n);
    }
    reportProgress(1);
    return { stage: 'newton', n: n, gradient: gradient, hessian: hessian, loss: loss };
  }

  throw new Error('Unknown or unsupported stage: ' + args.stage);
}

module.exports = { workFunction };
