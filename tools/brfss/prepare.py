"""Turn the raw BRFSS 2024 file into one JSON file per site plus a shared test set.

Test/demo tooling only. Not part of the package.

Usage (from the repo root):
    python tools/brfss/prepare.py demo/data/raw/LLCP2024.XPT demo/data/sites

Label: HAVARTH4 ("ever told you have some form of arthritis"), 1 = yes, 2 = no.
Rows with "don't know", "refused" or missing values for the label or any feature are dropped.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 20261115
TEST_PER_SITE = 600  # same number of test rows from every state, so the shared test set is balanced

# (site name, BRFSS _STATE FIPS code, training rows). Mostly small sites, like most hospitals:
# one large site, the rest too small to train a good model alone.
SITES = [
    ("new-york", 36, 3000),
    ("florida", 12, 1000),
    ("washington", 53, 400),
    ("minnesota", 27, 250),
    ("alaska", 2, 150),
]

FEATURE_NAMES = [
    "ageGroup",       # _AGEG5YR 1..13 (18-24 up to 80+), ordinal
    "female",         # _SEX 2
    "bmi",            # _BMI5 / 100
    "currentSmoker",  # _SMOKER3 1 or 2
    "formerSmoker",   # _SMOKER3 3
    "exercise",       # EXERANY2 1 (any exercise in past 30 days)
    "diabetes",       # DIABETE4 1
    "generalHealth",  # GENHLTH 1 (excellent) .. 5 (poor), ordinal
    "education",      # _EDUCAG 1..4, ordinal
    "incomeGroup",    # _INCOMG1 1..7, ordinal
]


def clean(df: pd.DataFrame) -> pd.DataFrame:
    keep = (
        df["HAVARTH4"].isin([1, 2])
        & df["_AGEG5YR"].between(1, 13)
        & df["_SEX"].isin([1, 2])
        & df["_BMI5"].notna()
        & df["_SMOKER3"].isin([1, 2, 3, 4])
        & df["EXERANY2"].isin([1, 2])
        & df["DIABETE4"].isin([1, 2, 3, 4])
        & df["GENHLTH"].between(1, 5)
        & df["_EDUCAG"].between(1, 4)
        & df["_INCOMG1"].between(1, 7)
    )
    d = df[keep]
    out = pd.DataFrame(
        {
            "state": d["_STATE"].astype(int),
            "ageGroup": d["_AGEG5YR"].astype(int),
            "female": (d["_SEX"] == 2).astype(int),
            "bmi": (d["_BMI5"] / 100.0).round(2),
            "currentSmoker": d["_SMOKER3"].isin([1, 2]).astype(int),
            "formerSmoker": (d["_SMOKER3"] == 3).astype(int),
            "exercise": (d["EXERANY2"] == 1).astype(int),
            "diabetes": (d["DIABETE4"] == 1).astype(int),
            "generalHealth": d["GENHLTH"].astype(int),
            "education": d["_EDUCAG"].astype(int),
            "incomeGroup": d["_INCOMG1"].astype(int),
            "arthritis": (d["HAVARTH4"] == 1).astype(int),
        }
    )
    return out


def split(site_df: pd.DataFrame, rng: np.random.Generator, test_fraction: float):
    """Stratified train/test split by label."""
    test_idx = []
    for label in (0, 1):
        idx = site_df.index[site_df["arthritis"] == label].to_numpy().copy()
        rng.shuffle(idx)
        test_idx.extend(idx[: int(round(len(idx) * test_fraction))])
    test = site_df.loc[sorted(test_idx)]
    train = site_df.drop(index=test.index)
    return train, test


def to_payload(name, df):
    return {
        "site": name,
        "featureNames": FEATURE_NAMES,
        "X": df[FEATURE_NAMES].to_numpy().tolist(),
        "y": df["arthritis"].astype(int).tolist(),
    }


def main(raw_path: str, out_dir: str):
    raw = Path(raw_path)
    df = pd.read_pickle(raw) if raw.suffix == ".pkl" else pd.read_sas(raw, format="xport", encoding="infer")
    data = clean(df)
    rng = np.random.default_rng(SEED)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    tests = []
    summary = []
    for name, fips, n_train in SITES:
        n = n_train + TEST_PER_SITE
        state = data[data["state"] == fips]
        if len(state) < n:
            raise SystemExit(f"{name}: only {len(state)} clean rows, need {n}")
        sample = state.sample(n=n, random_state=int(rng.integers(1 << 31)))
        train, test = split(sample, rng, TEST_PER_SITE / n)
        tests.append(test.assign(site=name))
        (out / f"{name}.json").write_text(json.dumps(to_payload(name, train)))
        summary.append((name, len(train), len(test), round(train["arthritis"].mean(), 3)))

    test_all = pd.concat(tests)
    payload = to_payload("test", test_all)
    payload["site"] = test_all["site"].tolist()
    (out / "test.json").write_text(json.dumps(payload))

    print(f"clean rows overall: {len(data)}")
    for name, ntr, nte, prev in summary:
        print(f"{name:12s} train={ntr:5d} test={nte:4d} arthritis rate={prev}")
    print(f"shared test set: {len(test_all)} rows")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
