'use strict';

/** Small dense linear algebra for d in the tens. No dependencies. */

/** Unpack a row-major upper triangle into a full symmetric d x d matrix. */
function unpackUpper(packed, d) {
  const M = Array.from({ length: d }, () => new Array(d).fill(0));
  let idx = 0;
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      M[i][j] = packed[idx];
      M[j][i] = packed[idx];
      idx++;
    }
  }
  return M;
}

/** Solve A x = b for symmetric positive definite A by Cholesky. Throws if A is not SPD. */
function choleskySolve(A, b) {
  const d = A.length;
  const L = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 0)) throw new Error('Matrix is not positive definite');
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  // Forward: L z = b
  const z = new Array(d);
  for (let i = 0; i < d; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * z[k];
    z[i] = s / L[i][i];
  }
  // Backward: L^T x = z
  const x = new Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < d; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

module.exports = { unpackUpper, choleskySolve, sigmoid };
