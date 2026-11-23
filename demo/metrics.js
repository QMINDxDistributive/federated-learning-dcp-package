'use strict';

/** ROC AUC by the rank-sum method, with ties averaged. */
function auc(y, p) {
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  const ranks = new Array(p.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && p[idx[j + 1]] === p[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = r;
    i = j + 1;
  }
  let nPos = 0, sumPos = 0;
  for (let i = 0; i < y.length; i++) if (y[i] === 1) { nPos++; sumPos += ranks[i]; }
  const nNeg = y.length - nPos;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function accuracy(y, p, threshold = 0.5) {
  let ok = 0;
  for (let i = 0; i < y.length; i++) if ((p[i] >= threshold ? 1 : 0) === y[i]) ok++;
  return ok / y.length;
}

module.exports = { auc, accuracy };
