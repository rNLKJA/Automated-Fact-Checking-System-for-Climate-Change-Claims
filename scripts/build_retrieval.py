# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = [
#   "scikit-learn==1.2.2",
#   "numpy>=1.24,<2",
#   "pandas==2.0.3",
#   "scipy>=1.10,<1.14",
#   "nltk==3.8.1",
#   "contractions==0.1.73",
# ]
# ///
"""Step 1 - re-run the ORIGINAL TF-IDF evidence retrieval over the full corpus.

Inputs (in ``.cache/data``, see ``scripts/fetch_data.py``):
  dev-claims.json, test-claims-unlabelled.json
  processed_evidence.csv        evidence_id, evidence_text, evidence_tags (team artefact)
  evidence_tfidf.pkl            tag TF-IDF matrix of processed_evidence (team artefact)
  tfidf_tag_vectorizer.pkl      the "targeted" tag vectorizer (team artefact)
  evidence_ret.json             the team's saved 2024 dev retrieval (F = 0.04299, as reported)
  test-with-retrieved-evidences.json   the team's saved 2024 test retrieval

Output: ``.cache/build/retrieval.json`` - per-claim retrieval for dev + test under
two scoring configurations, parity against the 2024 files, metrics, threshold sweeps,
and a per-claim candidate *pool* (every passage that passes the filter plus every
passage tied with or above the top-n fallback scores). ``build_web_data.py`` puts
the pools into the web app's pruned index, so the TypeScript port re-running the
rule over the pruned index selects the same passages as this full-corpus run.

Two configurations exist because the notebook committed to GitHub is not the code
that produced the reported numbers:

* ``notebook``   - ``find_top_evidence`` exactly as committed (cell 24):
                   combined = sim + overlap + sim, filter sim>0.55, overlap>0.5,
                   combined>1.5.
* ``submission`` - reconstructed from the saved 2024 outputs: combined = sim +
                   overlap with the sim>0.55 / overlap>0.5 filter (no binding
                   combined threshold). It reproduces every saved dev and test
                   selection up to the order of exactly tied scores, and the
                   reported dev F-score.

``find_top_evidence`` spends ~3 s per claim in ``pandas.apply``; the overlap
columns are computed with an inverted index instead and fed through the
identical pandas selection code (``--verify N`` checks this against the verbatim
function).

Usage:  uv run scripts/build_retrieval.py [--verify 2]
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

import original as O

BUILD = O.CACHE / "build"
BUILD.mkdir(parents=True, exist_ok=True)

CONFIGS = {
    "submission": {"sim_weight": 1, "top_n": 6, "t_sim": 0.55, "t_overlap": 0.5, "t_combined": 1.0},
    "notebook": {"sim_weight": 2, "top_n": 6, "t_sim": 0.55, "t_overlap": 0.5, "t_combined": 1.5},
}
POOL_K = 12  # fallback depth kept per claim
POOL_TIE_CAP = 200  # keep all exact ties at the top-n boundary unless there are more than this

SWEEPS = {
    "t_sim": [round(x, 2) for x in np.arange(0.30, 0.951, 0.05)],
    "t_overlap": [round(x, 2) for x in np.arange(0.0, 0.951, 0.05)],
    "t_combined": [round(x, 2) for x in np.arange(1.0, 2.451, 0.1)],
    "top_n": list(range(1, 13)),
}


def claim_tags_of(text: str) -> str:
    """Claim "tags" as in cells 25-26 and the saved 2024 files: sorted stems joined by spaces."""
    return " ".join(sorted(O.preprocess_and_tokenize(text)))


def combine(sim, overlap, sim_weight):
    # notebook: similarities + overlap_rates + similarities_between_claim_and_evidence
    return sim + overlap + sim if sim_weight == 2 else sim + overlap


class FastRetriever:
    """Same maths as ``original.find_top_evidence`` with an inverted index for the overlap."""

    def __init__(self, evidence_df: pd.DataFrame, evidence_tfidf, vectorizer):
        self.df = evidence_df.reset_index(drop=True).copy()
        self.tfidf = evidence_tfidf
        self.vectorizer = vectorizer
        t = time.time()
        postings: dict[str, list[int]] = defaultdict(list)
        n_words = np.zeros(len(self.df), dtype=np.int64)
        for i, tags in enumerate(self.df["evidence_tags"].tolist()):
            words = set(tags.split())
            n_words[i] = len(words)
            for w in words:
                postings[w].append(i)
        self.postings = {w: np.asarray(ix, dtype=np.int64) for w, ix in postings.items()}
        self.n_words = n_words
        print(f"inverted index: {len(self.postings):,} tag words in {time.time() - t:.1f}s", flush=True)

    def features(self, claim_tags: str):
        claim_tfidf = self.vectorizer.transform([claim_tags])
        sim = cosine_similarity(claim_tfidf, self.tfidf).flatten()
        claim_words = set(claim_tags.split())
        counts = np.zeros(len(self.df), dtype=np.int64)
        for w in claim_words:
            ix = self.postings.get(w)
            if ix is not None:
                counts[ix] += 1  # sets: each word at most once per passage
        overlap = counts / np.minimum(len(claim_words), self.n_words)
        return sim, overlap, counts

    def select(self, sim, overlap, counts, sim_weight, top_n, t_sim, t_overlap, t_combined):
        """Selection code of ``find_top_evidence`` with parameterised scoring/thresholds."""
        evidence_df = self.df
        evidence_df["similaritie"] = sim
        evidence_df["overlap_rate"] = overlap
        evidence_df["combined_score"] = combine(sim, overlap, sim_weight)
        evidence_df["max_match"] = counts
        filtered_evidence = evidence_df[
            (evidence_df.similaritie > t_sim)
            & (evidence_df.overlap_rate > t_overlap)
            & (evidence_df.combined_score > t_combined)
        ]
        if filtered_evidence.empty:
            path = "fallback"
            relevant_evidence = evidence_df.sort_values(by="combined_score", ascending=False).head(top_n)
        else:
            path = "filtered"
            relevant_evidence = filtered_evidence.sort_values(
                by=["overlap_rate", "similaritie"], ascending=[False, False]
            )
            relevant_evidence = relevant_evidence.sort_values(by="combined_score", ascending=False)
            max_match_value = max(relevant_evidence["max_match"])
            relevant_evidence = relevant_evidence[relevant_evidence.max_match == max_match_value].head(top_n)
        return path, int(len(filtered_evidence)), relevant_evidence

    def pool(self, sim, overlap, sim_weight, top_n, t_sim, t_overlap, t_combined):
        """Positions that can be selected by the rule over ANY subset containing them."""
        comb = combine(sim, overlap, sim_weight)
        mask = (sim > t_sim) & (overlap > t_overlap) & (comb > t_combined)
        keep = set(np.flatnonzero(mask).tolist())
        top = np.argpartition(-comb, POOL_K)[:POOL_K]
        keep.update(top.tolist())
        boundary = np.sort(comb[top])[::-1][top_n - 1]
        ties = np.flatnonzero(comb >= boundary)
        if len(ties) <= POOL_TIE_CAP:
            keep.update(ties.tolist())
        return keep

    def candidates(self, sim, overlap, counts, sim_weight):
        """Rows that can pass any threshold in SWEEPS, plus the full-corpus fallback order."""
        comb = combine(sim, overlap, sim_weight)
        mask = (sim > min(SWEEPS["t_sim"])) & (overlap > min(SWEEPS["t_overlap"])) & (comb > 0.99)
        cand = self.df.loc[mask, ["evidence_id"]].copy()
        cand["similaritie"] = sim[mask]
        cand["overlap_rate"] = overlap[mask]
        cand["combined_score"] = comb[mask]
        cand["max_match"] = counts[mask]
        self.df["combined_score"] = comb
        fallback = self.df.sort_values(by="combined_score", ascending=False).head(max(SWEEPS["top_n"]))
        return cand, fallback["evidence_id"].tolist()


def select_from_candidates(cand, fallback_ids, sim_weight, top_n, t_sim, t_overlap, t_combined):
    filtered = cand[
        (cand.similaritie > t_sim) & (cand.overlap_rate > t_overlap) & (cand.combined_score > t_combined)
    ]
    if filtered.empty:
        return "fallback", fallback_ids[:top_n]
    rel = filtered.sort_values(by=["overlap_rate", "similaritie"], ascending=[False, False])
    rel = rel.sort_values(by="combined_score", ascending=False)
    rel = rel[rel.max_match == max(rel["max_match"])].head(top_n)
    return "filtered", rel["evidence_id"].tolist()


def prf(retrieved, gold):
    """Per-claim evidence precision/recall/F exactly as coursework/scripts/eval.py."""
    if not retrieved:
        return 0.0, 0.0, 0.0
    top = set(retrieved)
    correct = sum(1 for g in gold if g in top)
    if correct == 0:
        return 0.0, 0.0, 0.0
    r = correct / len(gold)
    p = correct / len(retrieved)
    return p, r, 2 * p * r / (p + r)


def scored_rows(rows):
    return [
        {
            "id": r.evidence_id,
            "sim": float(r.similaritie),
            "overlap": float(r.overlap_rate),
            "combined": float(r.combined_score),
            "max_match": int(r.max_match),
        }
        for r in rows.itertuples()
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", type=int, default=2, help="check fast path vs verbatim on N claims")
    args = ap.parse_args()

    t0 = time.time()
    dev = O.load_claims("dev-claims.json")
    test = O.load_claims("test-claims-unlabelled.json")
    saved = {"dev": O.load_claims("evidence_ret.json"), "test": O.load_claims("test-with-retrieved-evidences.json")}
    vectorizer = O.load_pickle("tfidf_tag_vectorizer.pkl")
    evidence_tfidf = O.load_pickle("evidence_tfidf.pkl")
    evidence_df = O.load_processed_evidence()
    assert evidence_tfidf.shape[0] == len(evidence_df), "tfidf rows must align with CSV rows"
    print(f"loaded artefacts in {time.time() - t0:.1f}s; corpus rows = {len(evidence_df):,}", flush=True)
    fast = FastRetriever(evidence_df, evidence_tfidf, vectorizer)
    retrievable = set(fast.df["evidence_id"])

    # ---- 1. fast path == verbatim notebook function --------------------------
    verify = []
    for cid in list(dev)[: args.verify]:
        tags = claim_tags_of(dev[cid]["claim_text"])
        slow = O.find_top_evidence(tags, evidence_tfidf, vectorizer, evidence_df.copy(), top_n=6)
        sim, ov, cnt = fast.features(tags)
        _, _, rows = fast.select(sim, ov, cnt, **CONFIGS["notebook"])
        verify.append({"claim_id": cid, "equal": slow == rows["evidence_id"].tolist()})
        print(f"verify {cid}: equal={verify[-1]['equal']}", flush=True)
    assert all(v["equal"] for v in verify), verify

    # ---- 2. retrieval for dev + test under both configurations ---------------
    out = {"dev": {}, "test": {}}
    cache = {name: {} for name in CONFIGS}
    for split, claims in (("dev", dev), ("test", test)):
        for i, (cid, c) in enumerate(claims.items()):
            tags = claim_tags_of(c["claim_text"])
            assert tags == saved[split][cid]["claim_text"], f"{cid}: claim tags differ from the 2024 file"
            sim, ov, cnt = fast.features(tags)
            row = {"claim_text": c["claim_text"], "tags": tags, "saved_2024": saved[split][cid]["evidences"]}
            pool: set[int] = set()
            if split == "dev":
                row["label"] = c["claim_label"]
                row["gold"] = c["evidences"]
                row["gold_retrievable"] = [e in retrievable for e in c["evidences"]]
            for name, cfg in CONFIGS.items():
                path, n_filtered, rows = fast.select(sim, ov, cnt, **cfg)
                row[name] = {"ids": rows["evidence_id"].tolist(), "path": path,
                             "n_filtered": n_filtered, "scores": scored_rows(rows)}
                pool |= fast.pool(sim, ov, cfg["sim_weight"], cfg["top_n"], cfg["t_sim"], cfg["t_overlap"],
                                  cfg["t_combined"])
                if split == "dev":
                    row[name]["prf"] = prf(row[name]["ids"], c["evidences"])
                    cache[name][cid] = fast.candidates(sim, ov, cnt, cfg["sim_weight"])
            # scores of the saved 2024 ids under the submission scoring (tie analysis)
            comb = combine(sim, ov, 1)
            pos = fast.df.index[fast.df["evidence_id"].isin(row["saved_2024"])]
            by_id = dict(zip(fast.df.loc[pos, "evidence_id"], comb[pos]))
            row["saved_2024_combined"] = [float(by_id[e]) for e in row["saved_2024"]]
            if split == "dev":
                # the committed notebook's final cell passed the RAW claim text as "tags"
                rsim, rov, rcnt = fast.features(c["claim_text"])
                rpath, rn, rrows = fast.select(rsim, rov, rcnt, **CONFIGS["notebook"])
                row["notebook_raw_claim_ids"] = rrows["evidence_id"].tolist()
                row["notebook_raw_claim"] = {"ids": rrows["evidence_id"].tolist(), "path": rpath, "n_filtered": rn,
                                             "scores": scored_rows(rrows),
                                             "prf": prf(rrows["evidence_id"].tolist(), c["evidences"])}
                nb = CONFIGS["notebook"]
                pool |= fast.pool(rsim, rov, nb["sim_weight"], nb["top_n"], nb["t_sim"], nb["t_overlap"],
                                  nb["t_combined"])
            pool |= set(fast.df.index[fast.df["evidence_id"].isin(row["saved_2024"])].tolist())
            row["pool"] = sorted(fast.df["evidence_id"].iloc[sorted(pool)].tolist())
            out[split][cid] = row
            if i % 25 == 0:
                print(f"{split} {i}/{len(claims)}  {time.time() - t0:.0f}s", flush=True)

    # ---- 3. parity with the saved 2024 outputs ------------------------------
    parity = {"verify_fast_vs_verbatim": verify}
    for split in ("dev", "test"):
        rows = out[split].values()
        sub = [r["submission"] for r in rows]
        exact = sum(s["ids"] == r["saved_2024"] for s, r in zip(sub, rows))
        same_set = sum(set(s["ids"]) == set(r["saved_2024"]) for s, r in zip(sub, rows))
        tie_equiv = sum(
            len(s["ids"]) == len(r["saved_2024"])
            and np.allclose(sorted(x["combined"] for x in s["scores"]), sorted(r["saved_2024_combined"]), atol=1e-12)
            for s, r in zip(sub, rows)
        )
        nb_exact = sum(r["notebook"]["ids"] == r["saved_2024"] for r in rows)
        parity[split] = {"total": len(out[split]), "submission_exact": exact, "submission_same_set": same_set,
                         "submission_equal_up_to_ties": tie_equiv, "notebook_exact": nb_exact}
    print("parity", json.dumps({k: v for k, v in parity.items() if k != "verify_fast_vs_verbatim"}), flush=True)

    dv = list(out["dev"].values())
    mean_f = lambda ids_of: float(np.mean([prf(ids_of(r), r["gold"])[2] for r in dv]))
    metrics = {
        "dev_f_saved_2024": mean_f(lambda r: r["saved_2024"]),
        "dev_f_submission_rerun": mean_f(lambda r: r["submission"]["ids"]),
        "dev_f_notebook_rerun": mean_f(lambda r: r["notebook"]["ids"]),
        "dev_f_notebook_raw_claim": mean_f(lambda r: r["notebook_raw_claim_ids"]),
        "dev_precision_saved_2024": float(np.mean([prf(r["saved_2024"], r["gold"])[0] for r in dv])),
        "dev_recall_saved_2024": float(np.mean([prf(r["saved_2024"], r["gold"])[1] for r in dv])),
        "dev_fallback_share_submission": float(np.mean([r["submission"]["path"] == "fallback" for r in dv])),
        "dev_fallback_share_notebook": float(np.mean([r["notebook"]["path"] == "fallback" for r in dv])),
        "dev_gold_retrievable_share": float(np.mean([x for r in dv for x in r["gold_retrievable"]])),
        "dev_claims_with_any_hit_saved_2024": int(sum(prf(r["saved_2024"], r["gold"])[2] > 0 for r in dv)),
    }
    print("metrics", json.dumps(metrics), flush=True)

    # ---- 4. threshold sweeps on dev (one parameter at a time) ---------------
    sweeps = {}
    for name, cfg in CONFIGS.items():
        for cid, (cand, fb) in cache[name].items():
            _, ids = select_from_candidates(cand, fb, **cfg)
            assert ids == out["dev"][cid][name]["ids"], (name, cid)
        sweeps[name] = {}
        for param, values in SWEEPS.items():
            rows = []
            for val in values:
                kw = dict(cfg)
                kw[param] = val
                stats = []
                for cid, (cand, fb) in cache[name].items():
                    path, ids = select_from_candidates(cand, fb, **kw)
                    stats.append((*prf(ids, out["dev"][cid]["gold"]), len(ids), path == "fallback"))
                s = np.array(stats, dtype=float)
                rows.append({"value": float(val), "precision": s[:, 0].mean(), "recall": s[:, 1].mean(),
                             "f": s[:, 2].mean(), "avg_retrieved": s[:, 3].mean(), "fallback_share": s[:, 4].mean()})
            sweeps[name][param] = rows
            print(f"sweep {name}.{param}: " + " ".join(f"{r['value']:g}:{r['f']:.4f}" for r in rows), flush=True)

    with open(BUILD / "retrieval.json", "w") as f:
        json.dump({"configs": CONFIGS, "dev": out["dev"], "test": out["test"], "parity": parity,
                   "metrics": metrics, "sweeps": sweeps, "corpus_rows": int(len(evidence_df))}, f)
    print(f"wrote {BUILD / 'retrieval.json'} in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
