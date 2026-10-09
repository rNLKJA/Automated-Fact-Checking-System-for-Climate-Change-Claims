# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy>=1.26",
#   "scipy>=1.11",
#   "statsmodels>=0.14",
#   "scikit-learn>=1.3",
# ]
# ///
"""Reference values for the web app's statistics helpers (web/src/lib/stats).

The TypeScript helpers are checked against the Python scientific stack rather
than against hand-typed numbers:

* distributions: scipy.stats (norm, chi2, binom) and scipy.special.gammaln
* Wilson intervals, McNemar's test, Cohen's h: statsmodels
* precision / recall / F1 / macro-F1: scikit-learn
* percentile bootstrap: numpy.quantile on resamples drawn from a Python port of
  the same mulberry32 generator, so the TypeScript intervals can be compared
  digit for digit (plus scipy.stats.bootstrap as an independent sanity check)
* the dev-set baseline report shown on /results, recomputed from
  web/data/climate.db with the libraries above

Writes web/src/lib/__fixtures__/stats-reference.json. Run from the repository root:

    uv run scripts/stats_reference.py
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
from scipy import special, stats
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support
from statsmodels.stats.contingency_tables import mcnemar
from statsmodels.stats.proportion import proportion_confint, proportion_effectsize

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "web" / "data" / "climate.db"
OUT = ROOT / "web" / "src" / "lib" / "__fixtures__" / "stats-reference.json"

LABELS = ["SUPPORTS", "REFUTES", "NOT_ENOUGH_INFO", "DISPUTED"]
MASK = 0xFFFFFFFF


# --------------------------------------------------------------------------- rng
def mulberry32(seed: int):
    """Bit-exact port of web/src/lib/stats/random.ts."""
    a = seed & MASK

    def imul(x: int, y: int) -> int:
        return (x * y) & MASK

    def rng() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & MASK
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & MASK) ^ t
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    return rng


def resample_indices(n: int, resamples: int, seed: int) -> np.ndarray:
    rng = mulberry32(seed)
    out = np.empty((resamples, n), dtype=np.int64)
    for b in range(resamples):
        for i in range(n):
            out[b, i] = int(rng() * n)
    return out


def sample_without_replacement(items: list, k: int, seed: int) -> list:
    rng = mulberry32(seed)
    pool = list(items)
    m = max(0, min(k, len(pool)))
    for i in range(m):
        j = i + int(rng() * (len(pool) - i))
        pool[i], pool[j] = pool[j], pool[i]
    return pool[:m]


LEVEL = 0.95
ALPHA = 1 - LEVEL  # 0.050000000000000044, the same float the TypeScript code uses


def percentile_ci(values: np.ndarray) -> list[float]:
    lo, hi = np.quantile(values, [ALPHA / 2, 1 - ALPHA / 2])
    return [float(lo), float(hi)]


def boot(values: np.ndarray, estimate: float) -> dict:
    return {
        "estimate": float(estimate),
        "lower": percentile_ci(values)[0],
        "upper": percentile_ci(values)[1],
        "se": float(np.std(values, ddof=1)),
    }


def wilson(k: int, n: int) -> dict:
    lo, hi = proportion_confint(k, n, alpha=ALPHA, method="wilson")
    return {"k": k, "n": n, "estimate": k / n, "lower": float(lo), "upper": float(hi)}


def macro_f1(gold, pred, labels=None) -> float:
    return float(f1_score(gold, pred, labels=labels, average="macro", zero_division=0))


def shared_labels(*label_lists) -> list[str]:
    """The labels in gold or either system's predictions: one macro-F1 label set for a pair."""
    return sorted(set().union(*(set(x) for x in label_lists)))


# ----------------------------------------------------------------- unit fixtures
def unit_fixtures() -> dict:
    out: dict = {}

    out["mulberry32"] = {
        str(seed): _take(mulberry32(seed), 8) for seed in (0, 42, 2026, -1, 4294967295)
    }
    out["sample"] = {
        "items": list(range(154)),
        "k": 20,
        "seed": 42,
        "expected": sample_without_replacement(list(range(154)), 20, 42),
    }

    rs = np.random.default_rng(11)
    qs_x = [rs.normal(size=7).round(6).tolist(), rs.uniform(size=50).round(6).tolist(), [1.0, 1.0, 2.0]]
    ps = [0.0, 0.025000000000000022, 0.1, 0.5, 0.9, 0.975, 1.0]
    out["quantile"] = [
        {"x": x, "p": ps, "expected": [float(np.quantile(x, p)) for p in ps]} for x in qs_x
    ]

    ppf_p = [1e-12, 1e-6, 0.001, 0.01, 0.025, 0.05, 0.2, 0.5, 0.7, 0.975, 0.999, 1 - 1e-9]
    out["normal_ppf"] = [[p, float(stats.norm.ppf(p))] for p in ppf_p]
    zs = [-6.0, -3.0, -1.959963984540054, -0.5, 0.0, 0.3, 1.0, 2.5, 5.0]
    out["normal_cdf"] = [[z, float(stats.norm.cdf(z))] for z in zs]
    chi = [(0.1, 1), (1.0, 1), (3.841458820694124, 1), (10.0, 1), (25.0, 1), (2.0, 3), (7.5, 4)]
    out["chi2_sf"] = [[x, df, float(stats.chi2.sf(x, df))] for x, df in chi]
    binoms = [(0, 5, 0.5), (3, 10, 0.5), (7, 20, 0.5), (2, 9, 0.3), (40, 154, 0.5), (60, 61, 0.5)]
    out["binom_cdf"] = [[k, n, p, float(stats.binom.cdf(k, n, p))] for k, n, p in binoms]
    out["gammaln"] = [[x, float(special.gammaln(x))] for x in (0.1, 0.5, 1.0, 2.5, 10.0, 155.0, 1000.5)]

    out["wilson"] = [
        {**wilson(k, n), "level": LEVEL}
        for k, n in [(0, 20), (1, 20), (10, 20), (19, 20), (20, 20), (59, 154), (68, 154), (13, 154)]
    ]
    lo90, hi90 = proportion_confint(7, 20, alpha=0.1, method="wilson")
    out["wilson_90"] = {"k": 7, "n": 20, "level": 0.9, "lower": float(lo90), "upper": float(hi90)}

    tables = [(0, 0), (3, 0), (5, 1), (10, 4), (12, 21), (31, 22), (1, 30)]
    out["mcnemar"] = []
    for b, c in tables:
        table = [[7, b], [c, 9]]
        ex = mcnemar(table, exact=True)
        with np.errstate(divide="ignore", invalid="ignore"):  # b + c = 0 has no chi-square
            ch = mcnemar(table, exact=False, correction=True)
        out["mcnemar"].append(
            {
                "b": b,
                "c": c,
                "exact_p": float(ex.pvalue),
                "chi2": float(ch.statistic) if b + c else 0.0,
                "chi2_p": float(ch.pvalue) if b + c else 1.0,
            }
        )

    out["cohens_h"] = [
        [p1, p2, float(proportion_effectsize(p1, p2))]
        for p1, p2 in [(0.383, 0.4416), (0.5, 0.5), (0.9, 0.1), (0.0, 1.0), (0.65, 0.4)]
    ]

    rs = np.random.default_rng(5)
    cls = []
    for n, k in [(30, 4), (12, 3), (154, 4)]:
        gold = [LABELS[i] for i in rs.integers(0, k, size=n)]
        pred = [LABELS[i] for i in rs.integers(0, k, size=n)]
        labels = sorted(set(gold) | set(pred))
        p, r, f, s = precision_recall_fscore_support(gold, pred, labels=labels, zero_division=0)
        cls.append(
            {
                "gold": gold,
                "pred": pred,
                "labels": labels,
                "accuracy": float(accuracy_score(gold, pred)),
                "precision": p.tolist(),
                "recall": r.tolist(),
                "f1": f.tolist(),
                "support": s.tolist(),
                "macro_f1": macro_f1(gold, pred),
            }
        )
    # a prediction-only label (never in gold) and a gold-only label
    gold = ["SUPPORTS", "SUPPORTS", "REFUTES", "REFUTES", "DISPUTED"]
    pred = ["SUPPORTS", "NOT_ENOUGH_INFO", "REFUTES", "SUPPORTS", "SUPPORTS"]
    labels = sorted(set(gold) | set(pred))
    p, r, f, s = precision_recall_fscore_support(gold, pred, labels=labels, zero_division=0)
    cls.append(
        {
            "gold": gold,
            "pred": pred,
            "labels": labels,
            "accuracy": float(accuracy_score(gold, pred)),
            "precision": p.tolist(),
            "recall": r.tolist(),
            "f1": f.tolist(),
            "support": s.tolist(),
            "macro_f1": macro_f1(gold, pred),
        }
    )
    out["classification"] = cls

    # bootstrap of a mean: exact (same stream) and scipy (independent stream)
    x = np.random.default_rng(3).gamma(2.0, 1.5, size=40).round(6)
    idx = resample_indices(len(x), 2000, 99)
    means = x[idx].mean(axis=1)
    sp = stats.bootstrap((x,), np.mean, n_resamples=20000, method="percentile", random_state=1)
    out["bootstrap_mean"] = {
        "x": x.tolist(),
        "resamples": 2000,
        "seed": 99,
        **boot(means, x.mean()),
        "scipy_percentile": [float(sp.confidence_interval.low), float(sp.confidence_interval.high)],
    }

    # bootstrap of macro-F1 with sklearn on each resample
    g = cls[0]["gold"]
    pr = cls[0]["pred"]
    idx = resample_indices(len(g), 500, 7)
    vals = np.array([macro_f1([g[i] for i in row], [pr[i] for i in row]) for row in idx])
    out["bootstrap_macro_f1"] = {
        "gold": g,
        "pred": pr,
        "resamples": 500,
        "seed": 7,
        **boot(vals, macro_f1(g, pr)),
    }

    # two systems on one shared macro-F1 label set (a label only system A predicts
    # must count against B's average too), with a paired bootstrap of the difference
    g = ["SUPPORTS", "SUPPORTS", "NOT_ENOUGH_INFO", "REFUTES"]
    a = ["SUPPORTS", "SUPPORTS", "NOT_ENOUGH_INFO", "DISPUTED"]
    b = ["SUPPORTS", "SUPPORTS", "NOT_ENOUGH_INFO", "SUPPORTS"]
    labels = shared_labels(g, a, b)
    rows = resample_indices(len(g), 500, 13)
    diffs = []
    for row in rows:
        gg, aa, bb = ([x[i] for i in row] for x in (g, a, b))
        lab = shared_labels(gg, aa, bb)
        diffs.append(macro_f1(gg, aa, lab) - macro_f1(gg, bb, lab))
    out["macro_f1_shared"] = {
        "gold": g,
        "pred_a": a,
        "pred_b": b,
        "labels": labels,
        "macro_f1_a": macro_f1(g, a, labels),
        "macro_f1_b": macro_f1(g, b, labels),
        "macro_f1_b_own_labels": macro_f1(g, b),
        "resamples": 500,
        "seed": 13,
        **boot(np.array(diffs), macro_f1(g, a, labels) - macro_f1(g, b, labels)),
    }
    return out


def _take(rng, k):
    return [rng() for _ in range(k)]


# --------------------------------------------------------------- dev baseline
def evidence_scores(retrieved: list[str], gold: list[str]) -> tuple[float, float, float, int]:
    """coursework/scripts/eval.py, per claim."""
    if not retrieved:
        return 0.0, 0.0, 0.0, 0
    correct = sum(1 for g in gold if g in set(retrieved))
    if correct == 0:
        return 0.0, 0.0, 0.0, 0
    r = correct / len(gold)
    p = correct / len(retrieved)
    return p, r, 2 * p * r / (p + r), correct


def hm(f: float, a: float) -> float:
    return 0.0 if f == 0 and a == 0 else 2 * f * a / (f + a)


def baseline() -> dict:
    db = sqlite3.connect(DB)
    claims = db.execute(
        "SELECT claim_id, label FROM claims WHERE split = 'dev' ORDER BY ord"
    ).fetchall()
    preds = {
        (cid, proto): label
        for cid, proto, label in db.execute("SELECT claim_id, protocol, label FROM predictions")
    }

    def ids(sql: str, cid: str) -> list[str]:
        return [r[0] for r in db.execute(sql, (cid,))]

    gold_labels, pred_of, scores = [], {p: [] for p in ("batch", "single", "gold_evidence")}, []
    for cid, label in claims:
        gold_labels.append(label)
        for p in pred_of:
            pred_of[p].append(preds[(cid, p)])
        retrieved = ids(
            "SELECT evidence_id FROM retrieval WHERE claim_id = ? AND run = 'saved_2024' ORDER BY rank",
            cid,
        )
        gold_ev = ids("SELECT evidence_id FROM claim_evidence WHERE claim_id = ? ORDER BY rank", cid)
        scores.append(evidence_scores(retrieved, gold_ev))

    n = len(claims)
    B, SEED = 10_000, 2026
    idx = resample_indices(n, B, SEED)
    g = np.array(gold_labels)

    def evaluate(pred: list[str]) -> dict:
        p = np.array(pred)
        ok = (g == p).astype(float)
        k = int(ok.sum())
        accs = ok[idx].mean(axis=1)
        f1s = np.array([macro_f1(g[row], p[row]) for row in idx])
        labels = sorted(set(gold_labels) | set(pred))
        pr, rc, f1, s = precision_recall_fscore_support(g, p, labels=labels, zero_division=0)
        return {
            "accuracy": wilson(k, n),
            "accuracy_bootstrap": boot(accs, k / n),
            "macro_f1": boot(f1s, macro_f1(g, p)),
            "labels": labels,
            "per_class": {
                "precision": pr.tolist(),
                "recall": rc.tolist(),
                "f1": f1.tolist(),
                "support": s.tolist(),
            },
        }

    def paired(pred_a: list[str], pred_b: list[str]) -> dict:
        a, b = np.array(pred_a), np.array(pred_b)
        ok_a, ok_b = (g == a), (g == b)
        diffs = (ok_a.astype(float) - ok_b.astype(float))[idx].mean(axis=1)
        def f1_gap(row) -> float:
            lab = shared_labels(g[row], a[row], b[row])
            return macro_f1(g[row], a[row], lab) - macro_f1(g[row], b[row], lab)

        f1d = np.array([f1_gap(row) for row in idx])
        bb = int((ok_a & ~ok_b).sum())
        cc = int((~ok_a & ok_b).sum())
        table = [[int((ok_a & ok_b).sum()), bb], [cc, int((~ok_a & ~ok_b).sum())]]
        return {
            "difference": boot(diffs, ok_a.mean() - ok_b.mean()),
            "macro_f1_difference": boot(f1d, f1_gap(np.arange(n))),
            "b": bb,
            "c": cc,
            "exact_p": float(mcnemar(table, exact=True).pvalue),
            "cohens_h": float(proportion_effectsize(ok_a.mean(), ok_b.mean())),
        }

    P = np.array([s[0] for s in scores])
    R = np.array([s[1] for s in scores])
    F = np.array([s[2] for s in scores])
    hits = int(sum(1 for s in scores if s[3] > 0))
    ok_batch = (g == np.array(pred_of["batch"])).astype(float)
    hms = np.array([hm(F[row].mean(), ok_batch[row].mean()) for row in idx])

    by_label = []
    for label in LABELS:
        members = [i for i in range(n) if gold_labels[i] == label]
        fl = F[members]
        lidx = resample_indices(len(members), B, SEED)
        predicted_as = {l: sum(1 for i in members if pred_of["batch"][i] == l) for l in LABELS}
        by_label.append(
            {
                "label": label,
                "n": len(members),
                "predicted_as": predicted_as,
                "recall": wilson(predicted_as[label], len(members)),
                "mean_evidence_f": boot(fl[lidx].mean(axis=1), fl.mean()),
                "any_gold_found": wilson(
                    sum(1 for i in members if scores[i][3] > 0), len(members)
                ),
            }
        )

    always = ["SUPPORTS"] * n
    return {
        "n": n,
        "resamples": B,
        "seed": SEED,
        "protocols": {p: evaluate(v) for p, v in pred_of.items()},
        "majority": evaluate(always),
        "classifier_vs_majority": paired(pred_of["batch"], always),
        "gold_vs_retrieved": paired(pred_of["gold_evidence"], pred_of["batch"]),
        "retrieval": {
            "precision": boot(P[idx].mean(axis=1), P.mean()),
            "recall": boot(R[idx].mean(axis=1), R.mean()),
            "f": boot(F[idx].mean(axis=1), F.mean()),
            "any_gold_found": wilson(hits, n),
        },
        "harmonic_mean": boot(hms, hm(F.mean(), ok_batch.mean())),
        "by_label": by_label,
    }


def main() -> None:
    out = {
        "generated_by": "scripts/stats_reference.py",
        "level": LEVEL,
        "units": unit_fixtures(),
        "baseline": baseline(),
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    b = out["baseline"]
    acc = b["protocols"]["batch"]["accuracy"]
    print(
        f"dev accuracy {acc['estimate']:.4f} [{acc['lower']:.4f}, {acc['upper']:.4f}], "
        f"macro-F1 {b['protocols']['batch']['macro_f1']['estimate']:.4f}, "
        f"F {b['retrieval']['f']['estimate']:.5f}, HM {b['harmonic_mean']['estimate']:.5f}"
    )


if __name__ == "__main__":
    main()
