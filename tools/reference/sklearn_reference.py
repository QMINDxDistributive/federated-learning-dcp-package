"""Centralized reference fit with scikit-learn, used as a test fixture.

Test tooling only. Not part of the package.

Pools every site's training rows, standardizes with the pooled mean and population standard
deviation (the same mu and sigma the federated round 0 computes), and fits the same objective
as the LR spec: summed log loss + (l2 / 2) * ||w||^2, intercept not penalized. That is
scikit-learn's LogisticRegression(C = 1 / l2).

Usage (from the repo root):
    python tools/reference/sklearn_reference.py demo/data/sites test/fixtures/brfss-reference.json [l2]
"""

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, accuracy_score


def fit(X, y, l2):
    mean = X.mean(axis=0)
    std = X.std(axis=0)  # population std (ddof = 0), matches the spec
    Z = (X - mean) / std
    clf = LogisticRegression(C=1.0 / l2, solver="newton-cholesky", tol=1e-12, max_iter=1000)
    clf.fit(Z, y)
    w_std = clf.coef_[0]
    b_std = clf.intercept_[0]
    coef = w_std / std
    intercept = b_std - np.sum(w_std * mean / std)
    return {
        "mean": mean.tolist(),
        "std": std.tolist(),
        "standardizedIntercept": float(b_std),
        "standardizedCoefficients": w_std.tolist(),
        "intercept": float(intercept),
        "coefficients": coef.tolist(),
    }


def predict(model, X):
    z = model["intercept"] + X @ np.array(model["coefficients"])
    return 1 / (1 + np.exp(-z))


def main(sites_dir, out_path, l2=1.0):
    sites_dir = Path(sites_dir)
    site_files = sorted(p for p in sites_dir.glob("*.json") if p.name != "test.json")
    sites = [json.loads(p.read_text()) for p in site_files]
    test = json.loads((sites_dir / "test.json").read_text())

    X = np.vstack([np.array(s["X"], dtype=float) for s in sites])
    y = np.concatenate([np.array(s["y"]) for s in sites])
    Xt = np.array(test["X"], dtype=float)
    yt = np.array(test["y"])

    pooled = fit(X, y, l2)
    p = predict(pooled, Xt)
    pooled["testAuc"] = float(roc_auc_score(yt, p))
    pooled["testAccuracy"] = float(accuracy_score(yt, p >= 0.5))

    out = {
        "l2": l2,
        "featureNames": sites[0]["featureNames"],
        "sites": [s["site"] for s in sites],
        "rows": int(len(y)),
        "pooled": pooled,
    }
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(out, indent=2))
    print(f"pooled rows={len(y)} test AUC={pooled['testAuc']:.4f} acc={pooled['testAccuracy']:.4f}")
    for name, c in zip(out["featureNames"], pooled["coefficients"]):
        print(f"  {name:14s} {c:+.6f}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) == 4 else 1.0)
