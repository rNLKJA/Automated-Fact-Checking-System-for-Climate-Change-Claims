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
"""Step 3 - export everything the web app needs, plus the parity fixtures for its tests.

Inputs:  ``.cache/data`` (see fetch_data.py), ``.cache/build/retrieval.json``
         (build_retrieval.py), ``.cache/build/classifier.json`` (train_classifier.py)
         and the original notebook (for the numbers it printed in 2024).

Outputs (all committed, all small):
  web/data/climate.db                       read-only SQLite queried by the server
  web/src/lib/text/data/contractions-data.ts  contractions 0.1.73 dictionary (MIT)
  web/src/lib/text/data/stopwords-data.ts     NLTK English stopword list
  web/src/lib/__fixtures__/*.json           Python ground truth for the vitest parity suite

The database holds a PRUNED evidence index, never the full course corpus:
  * the gold evidence of every train and dev claim,
  * every passage the rule could select for any train, dev or test claim (the
    per-claim pools from build_retrieval.py - all filter passes + the top fallback
    scores),
  * every passage it could select for the Try-it examples (free_text_claims.py), and
  * a seeded random sample of the corpus as realistic distractors.
Each passage keeps the team's keyword tags and its exact row of ``evidence_tfidf``.
Claim TEXT is stored for the 154 dev claims only (the Explore pages show them);
train and test claims keep their id, label and derived tags.

Usage:  uv run scripts/build_web_data.py
"""

from __future__ import annotations

import json
import random
import re
import sqlite3
import time
from collections import Counter

import contractions
import numpy as np
import pandas as pd
from nltk.corpus import stopwords
from sklearn.metrics.pairwise import cosine_similarity

import original as O
from build_retrieval import CONFIGS, FastRetriever, claim_tags_of, combine, prf
from free_text_claims import EXAMPLES, HELDOUT

WEB = O.ROOT / "web"
DB_PATH = WEB / "data" / "climate.db"
TS_DATA = WEB / "src" / "lib" / "text" / "data"
FIXTURES = WEB / "src" / "lib" / "__fixtures__"
BUILD = O.CACHE / "build"
NOTEBOOK = O.ROOT / "coursework" / "COMP90042_Wed5PM_Group1.ipynb"

SAMPLE_N = 25_000
SEED = 2024
LABELS = ["SUPPORTS", "REFUTES", "NOT_ENOUGH_INFO", "DISPUTED"]

# Table 1 and Table 2 of the team's report (coursework/COMP90042_Wed5PM_Group1.pdf)
REPORT_LENGTHS = [
    ("Very short", 0, 5, 13_578),
    ("Short", 6, 10, 180_771),
    ("Medium short", 11, 20, 547_481),
    ("Medium", 21, 50, 451_498),
    ("Medium long", 51, 100, 15_217),
    ("Long", 101, 200, 270),
    ("Very long", 201, None, 12),
]
REPORT_RESULTS = {
    "validation": {"f": 0.04299, "accuracy": 0.55844, "hm": 0.07984},
    "test": {"f": 0.03310, "accuracy": 0.40790, "hm": 0.06120},
    "transformer_val_acc": 0.5714,
    "lstm_val_acc": 0.4675,
    "corpus_size": 1_208_827,
}

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE claims (
  claim_id TEXT PRIMARY KEY,
  split TEXT NOT NULL CHECK (split IN ('train', 'dev', 'test')),
  ord INTEGER NOT NULL,
  claim_text TEXT CHECK ((split = 'dev') = (claim_text IS NOT NULL)),
  label TEXT CHECK (label IN ('SUPPORTS', 'REFUTES', 'NOT_ENOUGH_INFO', 'DISPUTED')),
  tags TEXT NOT NULL,
  index_exact INTEGER NOT NULL CHECK (index_exact IN (0, 1))
);
CREATE INDEX claims_split ON claims (split, ord);
CREATE INDEX claims_tags ON claims (tags);
CREATE TABLE claim_evidence (
  claim_id TEXT NOT NULL REFERENCES claims (claim_id),
  rank INTEGER NOT NULL,
  evidence_id TEXT NOT NULL REFERENCES evidence (evidence_id),
  PRIMARY KEY (claim_id, rank)
);
CREATE INDEX claim_evidence_ev ON claim_evidence (evidence_id);
CREATE TABLE evidence (
  evidence_id TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  text TEXT NOT NULL,
  tags TEXT,
  vec BLOB,
  origin INTEGER NOT NULL
);
CREATE TABLE retrieval (
  claim_id TEXT NOT NULL REFERENCES claims (claim_id),
  run TEXT NOT NULL,
  rank INTEGER NOT NULL,
  evidence_id TEXT NOT NULL REFERENCES evidence (evidence_id),
  sim REAL NOT NULL,
  overlap REAL NOT NULL,
  combined REAL NOT NULL,
  max_match INTEGER NOT NULL,
  PRIMARY KEY (claim_id, run, rank)
);
CREATE TABLE retrieval_summary (
  claim_id TEXT NOT NULL REFERENCES claims (claim_id),
  run TEXT NOT NULL,
  path TEXT CHECK (path IN ('filtered', 'fallback')),  -- NULL for saved_2024: not in the 2024 file
  n_filtered INTEGER,
  n_retrieved INTEGER NOT NULL,
  n_correct INTEGER,
  precision REAL,
  recall REAL,
  f REAL,
  PRIMARY KEY (claim_id, run)
);
CREATE TABLE predictions (
  claim_id TEXT NOT NULL REFERENCES claims (claim_id),
  protocol TEXT NOT NULL,
  label TEXT NOT NULL,
  p0 REAL NOT NULL, p1 REAL NOT NULL, p2 REAL NOT NULL, p3 REAL NOT NULL,
  l0 REAL, l1 REAL, l2 REAL, l3 REAL,
  PRIMARY KEY (claim_id, protocol)
);
CREATE TABLE training_history (
  run TEXT NOT NULL,
  model TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  train_loss REAL NOT NULL,
  val_loss REAL NOT NULL,
  train_acc REAL NOT NULL,
  val_acc REAL NOT NULL,
  PRIMARY KEY (run, model, epoch)
);
CREATE TABLE sweeps (
  config TEXT NOT NULL,
  param TEXT NOT NULL,
  value REAL NOT NULL,
  precision REAL NOT NULL,
  recall REAL NOT NULL,
  f REAL NOT NULL,
  avg_retrieved REAL NOT NULL,
  fallback_share REAL NOT NULL,
  PRIMARY KEY (config, param, value)
);
CREATE TABLE vectorizer_terms (
  vectorizer TEXT NOT NULL,
  idx INTEGER NOT NULL,
  term TEXT NOT NULL,
  idf REAL NOT NULL,
  PRIMARY KEY (vectorizer, idx)
);
CREATE TABLE token_table (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  g0 REAL NOT NULL, g1 REAL NOT NULL, g2 REAL NOT NULL, g3 REAL NOT NULL
);
CREATE TABLE passage_lengths (
  ord INTEGER PRIMARY KEY,
  bucket TEXT NOT NULL,
  min_words INTEGER NOT NULL,
  max_words INTEGER,
  count INTEGER NOT NULL,
  report_count INTEGER NOT NULL
);
"""

ORIGIN_GOLD, ORIGIN_POOL, ORIGIN_SAMPLE, ORIGIN_EXAMPLE = 1, 2, 4, 8


def equal_up_to_ties(a: dict, b: dict) -> bool:
    """Same path, same scores, and the same passages except inside the tie group at the cut-off.

    Mirrors ``equalUpToTies`` in web/src/lib/retrieval.test.ts.
    """
    ca = [s["combined"] for s in a["scores"]]
    cb = [s["combined"] for s in b["scores"]]
    if a["path"] != b["path"] or len(ca) != len(cb):
        return False
    if any(abs(x - y) > 1e-9 for x, y in zip(ca, cb)):
        return False
    if not ca:
        return True
    cut = min(ca)
    above = lambda r, c: sorted(i for i, x in zip(r["ids"], c) if x - cut > 1e-9)
    return above(a, ca) == above(b, cb)


def pack_vec(row) -> bytes:
    """CSR row -> uint16 indices (ascending) followed by float64 weights, little endian."""
    order = np.argsort(row.indices, kind="stable")
    idx = row.indices[order].astype("<u2")
    w = row.data[order].astype("<f8")
    return idx.tobytes() + w.tobytes()


def parse_notebook_histories(nb: dict) -> dict:
    """Training logs printed by cells 43 (Transformer) and 44 (LSTM) of the 2024 run."""
    out = {}
    pattern = re.compile(r"Train loss ([\d.]+) accuracy ([\d.]+)\s+Val\s+loss ([\d.]+) accuracy ([\d.]+)")
    for cell in nb["cells"]:
        src = "".join(cell["source"])
        if cell["cell_type"] != "code" or "train_model(" not in src or "history = train_model" not in src:
            continue
        model = "transformer" if src.lstrip().startswith("# Train the Transformer") else "lstm"
        text = "".join("".join(o.get("text", "")) for o in cell.get("outputs", []))
        rows = [tuple(float(x) for x in m) for m in pattern.findall(text)]
        out[model] = [
            {"epoch": i + 1, "train_loss": a, "train_acc": b, "val_loss": c, "val_acc": d}
            for i, (a, b, c, d) in enumerate(rows)
        ]
    assert set(out) == {"transformer", "lstm"} and all(len(v) == 10 for v in out.values()), out.keys()
    return out


def notebook_printed(nb: dict) -> dict:
    """A few outputs the 2024 notebook printed, used as parity targets."""
    texts = {}
    for i, cell in enumerate(nb["cells"]):
        if cell["cell_type"] == "code":
            texts[i] = "".join("".join(o.get("text", "")) for o in cell.get("outputs", []))
    m = re.search(r"Evidence Retrieval F-score \(F\)\s+= ([\d.e-]+)\s+Claim Classification Accuracy \(A\) = ([\d.e-]+)\s+"
                  r"Harmonic Mean of F and A\s+= ([\d.e-]+)", texts[58])
    return {
        "cell10_claim_tags": texts[10].strip(),
        "cell16_keywords": texts[16].split("\n")[1].strip(),
        "cell26_retrieved": ["evidence-949564", "evidence-67732", "evidence-572512", "evidence-808896"],
        "cell58_dev_eval": {"f": float(m.group(1)), "accuracy": float(m.group(2)), "hm": float(m.group(3))},
    }


def main():
    t0 = time.time()
    nb = json.load(open(NOTEBOOK))
    printed = notebook_printed(nb)
    histories_2024 = parse_notebook_histories(nb)

    claims = {s: O.load_claims(f) for s, f in (("train", "train-claims.json"), ("dev", "dev-claims.json"),
                                                ("test", "test-claims-unlabelled.json"))}
    evidence = O.load_evidence()
    df = O.load_processed_evidence().reset_index(drop=True)
    evidence_tfidf = O.load_pickle("evidence_tfidf.pkl").tocsr()
    tag_vec = O.load_pickle("tfidf_tag_vectorizer.pkl")
    kw_vec = O.load_pickle("tfidf_keyword_vectorizer.pkl")
    retrieval = json.load(open(BUILD / "retrieval.json"))
    clf = json.load(open(BUILD / "classifier.json"))
    print(f"loaded inputs in {time.time() - t0:.0f}s", flush=True)

    pos_of = dict(zip(df["evidence_id"].tolist(), range(len(df))))
    tags_col = df["evidence_tags"].tolist()

    # ---- notebook parity: printed examples -------------------------------------------
    assert claim_tags_of("[South Australia] has the most expensive electricity in the world.") == \
        printed["cell10_claim_tags"]
    kw_claim = ("When 3 per cent of total annual global emissions of carbon dioxide are from humans and Australia "
                "produces 1.3 per cent of this 3 per cent, then no amount of emissions reduction here will have any "
                "effect on global climate.")
    assert set(O.extract_most_relevant_keywords_for_a_claim(kw_claim, tag_vec).split()) == \
        set(printed["cell16_keywords"].split())

    # ---- pruned evidence index -----------------------------------------------------------
    origin: Counter = Counter()
    gold_ids = {e for s in ("train", "dev") for c in claims[s].values() for e in c["evidences"]}
    pool_ids = set(retrieval["train_pool"])
    for split in ("dev", "test"):
        for row in retrieval[split].values():
            pool_ids |= set(row["pool"]) | set(row["saved_2024"])
            for run in ("submission", "notebook", "notebook_raw_claim"):
                if run in row:
                    pool_ids |= set(row[run]["ids"])
    example_ids = set(retrieval["example_pool"])
    rng = random.Random(SEED)
    sample_ids = set(df["evidence_id"].iloc[sorted(rng.sample(range(len(df)), SAMPLE_N))])
    all_ids = gold_ids | pool_ids | example_ids | sample_ids
    for e in all_ids:
        origin[e] = (ORIGIN_GOLD if e in gold_ids else 0) | (ORIGIN_POOL if e in pool_ids else 0) | \
                    (ORIGIN_SAMPLE if e in sample_ids else 0) | (ORIGIN_EXAMPLE if e in example_ids else 0)
    # ord = row position in the team's processed_evidence.csv (the order pandas scanned, which decides
    # ties); passages the team could not tag (and so never retrieved) go after them.
    corpus_order = {eid: i for i, eid in enumerate(evidence)}  # position in evidence.json
    ord_of = {e: pos_of[e] if e in pos_of else len(df) + corpus_order[e] for e in all_ids}
    ev_rows = []
    for eid in sorted(all_ids, key=ord_of.__getitem__):
        p = pos_of.get(eid)
        tags = tags_col[p] if p is not None else None
        vec = pack_vec(evidence_tfidf[p]) if p is not None else None
        ev_rows.append((eid, ord_of[eid], evidence[eid], tags, vec, origin[eid]))
    n_indexed = sum(r[3] is not None for r in ev_rows)
    print(f"pruned index: {len(ev_rows):,} passages ({n_indexed:,} retrievable); gold {len(gold_ids):,}, "
          f"pool {len(pool_ids):,}, examples {len(example_ids):,}, sample {len(sample_ids):,}", flush=True)

    # ---- the rule over the pruned index vs the full corpus ----------------------------------
    sub_pos = sorted(pos_of[r[0]] for r in ev_rows if r[3] is not None)
    pruned = FastRetriever(df.iloc[sub_pos], evidence_tfidf[sub_pos], tag_vec)

    def run_pruned(tags: str, cfg: dict) -> dict:
        sim, ov, cnt = pruned.features(tags)
        path, n_filtered, rows = pruned.select(sim, ov, cnt, **cfg)
        return {"ids": rows["evidence_id"].tolist(), "path": path,
                "scores": [{"combined": float(c)} for c in rows["combined_score"]]}

    # every claim whose full-corpus selection the pruned index reproduces (up to exact ties):
    # dev/test are re-checked by vitest; train is checked here (its pools are in the index)
    index_exact = {}
    for split in ("dev", "test"):
        for cid, row in retrieval[split].items():
            index_exact[cid] = all(equal_up_to_ties(run_pruned(row["tags"], cfg), row[name])
                                   for name, cfg in CONFIGS.items())
    for cid in claims["train"]:
        row = retrieval["train"].get(cid)  # absent for a claim with no tags
        index_exact[cid] = row is not None and all(
            equal_up_to_ties(run_pruned(row["tags"], cfg), row[name]) for name, cfg in CONFIGS.items())
    n_exact = Counter(s for s, cs in claims.items() for cid in cs if index_exact[cid])
    print(f"pruned index reproduces the full-corpus selection for {dict(n_exact)} claims", flush=True)
    assert n_exact["dev"] == len(claims["dev"]) and n_exact["test"] == len(claims["test"]), n_exact

    # Try-it examples: the note must describe the full-corpus run, and the pruned index must agree
    gold_of = {}
    for s_ in ("train", "dev"):
        for cid, c in claims[s_].items():
            for e in c["evidences"]:
                gold_of.setdefault(e, []).append(cid)
    try_examples = []
    for ex in retrieval["free_text"]["examples"]:
        full = ex["submission"]
        facts = {"gold" if any(e in gold_of for e in full["ids"]) else "no_gold", full["path"]}
        assert set(ex["expect"]) <= facts, (ex["text"], ex["expect"], facts)
        for name, cfg in CONFIGS.items():
            assert equal_up_to_ties(run_pruned(ex["tags"], cfg), ex[name]), (ex["text"], name)
        try_examples.append({"text": ex["text"], "note": ex["note"], "tags": ex["tags"]})

    # held-out free text: how often does the pruned index agree with the full corpus?
    free_text_parity = {"claims": len(retrieval["free_text"]["heldout"])}
    for name, cfg in CONFIGS.items():
        by_path = {"filtered": [0, 0], "fallback": [0, 0]}
        for h in retrieval["free_text"]["heldout"]:
            ok = equal_up_to_ties(run_pruned(h["tags"], cfg), h[name])
            by_path[h[name]["path"]][0] += ok
            by_path[h[name]["path"]][1] += 1
        free_text_parity[name] = {"agree": sum(v[0] for v in by_path.values()), "by_path": by_path}
    print("free-text agreement", json.dumps(free_text_parity), flush=True)

    # recomputing the tag TF-IDF of a passage from its tags must give its stored row
    check = rng.sample([r for r in ev_rows if r[3] is not None], 500)
    recomputed = tag_vec.transform([r[3] for r in check])
    stored = evidence_tfidf[[pos_of[r[0]] for r in check]]
    assert abs(recomputed - stored).max() < 1e-12, "evidence_tfidf rows are not tag_vec.transform(tags)"

    # ---- per-pair scores for every retrieved passage -------------------------------------
    def pair_scores(query: str, eid: str, sim_weight: int):
        p = pos_of[eid]
        sim = float(cosine_similarity(tag_vec.transform([query]), evidence_tfidf[p])[0, 0])
        cw, ew = set(query.split()), set(tags_col[p].split())
        inter = len(cw & ew)
        overlap = inter / min(len(cw), len(ew))
        return sim, overlap, float(combine(sim, overlap, sim_weight)), inter

    retrieval_rows, summary_rows = [], []
    for split in ("dev", "test"):
        for cid, row in retrieval[split].items():
            gold = claims[split][cid].get("evidences")
            runs = {"saved_2024": None, "submission": "submission", "notebook": "notebook"}
            if split == "dev":
                runs["notebook_raw"] = "notebook_raw_claim"
            for run, key in runs.items():
                if key is None:  # the team's saved list, scored with the submission rule
                    # the 2024 file records only ids, so its selection path is unknown (NULL)
                    ids, path, n_filtered = row["saved_2024"], None, None
                    scores = [pair_scores(row["tags"], e, 1) for e in ids]
                else:
                    r = row[key]
                    ids, path, n_filtered = r["ids"], r["path"], r["n_filtered"]
                    scores = [(s["sim"], s["overlap"], s["combined"], s["max_match"]) for s in r["scores"]]
                    query = row["claim_text"] if run == "notebook_raw" else row["tags"]
                    sw = CONFIGS["notebook" if run.startswith("notebook") else "submission"]["sim_weight"]
                    for e, s in zip(ids[:2], scores[:2]):  # spot-check the stored scores
                        assert np.allclose(pair_scores(query, e, sw), s, atol=1e-12), (cid, run, e)
                for rank, (e, s) in enumerate(zip(ids, scores)):
                    retrieval_rows.append((cid, run, rank, e, *s))
                if gold is not None:
                    p_, r_, f_ = prf(ids, gold)
                    n_correct = sum(1 for g in gold if g in set(ids))
                    summary_rows.append((cid, run, path, n_filtered, len(ids), n_correct, p_, r_, f_))
                else:
                    summary_rows.append((cid, run, path, n_filtered, len(ids), None, None, None, None))

    # ---- predictions --------------------------------------------------------------------
    pred_rows = []
    for cid, p in clf["dev_predictions"].items():
        pred_rows.append((cid, "batch", p["batch"], *p["batch_probs"], *p["batch_logits"]))
        pred_rows.append((cid, "single", p["single"], *p["single_probs"], *p["single_logits"]))
        pred_rows.append((cid, "gold_evidence", p["gold_evidence"], *p["gold_evidence_probs"], None, None, None, None))
    for cid, p in clf["test_predictions"].items():
        pred_rows.append((cid, "batch", p["batch"], *p["batch_probs"], None, None, None, None))

    # ---- passage lengths over the FULL corpus (report Table 1) ---------------------------
    counts = Counter()
    for text in evidence.values():
        n = len(text.split())
        for i, (_, lo, hi, _) in enumerate(REPORT_LENGTHS):
            if n >= lo and (hi is None or n <= hi):
                counts[i] += 1
                break
    length_rows = [(i, name, lo, hi, counts[i], rep) for i, (name, lo, hi, rep) in enumerate(REPORT_LENGTHS)]
    lengths_match = all(counts[i] == rep for i, (_, _, _, rep) in enumerate(REPORT_LENGTHS))
    print("passage lengths", [counts[i] for i in range(len(REPORT_LENGTHS))], "match report:", lengths_match)

    # ---- histories ----------------------------------------------------------------------
    hist_rows = []
    for model, rows in histories_2024.items():
        for r in rows:
            hist_rows.append(("2024", model, r["epoch"], r["train_loss"], r["val_loss"], r["train_acc"], r["val_acc"]))
    for model, h in clf["history"].items():
        for i in range(len(h["train_loss"])):
            hist_rows.append(("2026", model, i + 1, h["train_loss"][i], h["val_loss"][i], h["train_acc"][i],
                              h["val_acc"][i]))

    # ---- vectorizers + token table ------------------------------------------------------
    term_rows = []
    for name, v in (("tag", tag_vec), ("keyword", kw_vec)):
        for i, (term, idf) in enumerate(zip(v.get_feature_names_out().tolist(), v.idf_.tolist())):
            term_rows.append((name, i, term, idf))
    tt = clf["token_table"]
    token_rows = [(i, tok, *g) for i, (tok, g) in enumerate(zip(tt["tokens"], tt["g"]))]

    last_term = str(kw_vec.get_feature_names_out()[-1])
    artifact_count = int(sum(last_term in t.split() for t in tags_col))
    print(f"tag artifact {last_term!r} in {artifact_count:,} of {len(tags_col):,} passages", flush=True)

    # ---- meta ---------------------------------------------------------------------------
    m = retrieval["metrics"]
    meta = {
        "report": REPORT_RESULTS,
        "notebook_printed": printed,
        "retrieval_metrics": m,
        "retrieval_parity": {k: v for k, v in retrieval["parity"].items() if k != "verify_fast_vs_verbatim"},
        "retrieval_configs": CONFIGS,
        "classifier_metrics": clf["metrics"],
        "model": {
            "labels": tt["labels"], "max_len": tt["max_len"], "bias": tt["bias"], "vocab_size": len(tt["tokens"]),
            "model_dim": 256, "num_heads": 8, "num_encoder_layers": 6, "dim_feedforward": 512, "dropout": 0.1,
            "lstm_layers": 4, "epochs": 10, "batch_size": 16, "lr": 1e-4, "optimizer": "Adam",
        },
        "tag_vectorizer": {"max_df": 0.5, "min_df": 3, "max_features": 1000, "ngram_range": [1, 1]},
        "keyword_vectorizer": {"max_df": 0.5, "min_df": 5, "max_features": 20000, "ngram_range": [1, 3], "top_n": 10},
        "index": {
            "passages": len(ev_rows), "retrievable": n_indexed, "gold": len(gold_ids), "pool": len(pool_ids),
            "examples": len(example_ids), "sample": len(sample_ids), "sample_seed": SEED,
            "corpus_rows": int(len(df)), "corpus_total": len(evidence),
        },
        "try_examples": try_examples,
        "free_text_parity": free_text_parity,
        "passage_lengths_match_report": lengths_match,
        # numpy's argsort pads short passages' top-10 with zero-weight features; the last
        # vocabulary entry is alphabetic, so it leaks into many tags (see web/src/lib/numpy.ts)
        "tag_artifact": {"term": last_term, "passages": artifact_count, "of": int(len(tags_col))},
        "claims": {s: len(c) for s, c in claims.items()},
    }

    # ---- write the database --------------------------------------------------------------
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    con.executemany("INSERT INTO meta VALUES (?, ?)", [(k, json.dumps(v)) for k, v in meta.items()])
    for split, cs in claims.items():
        # claim text only for dev (shown on /explore); train/test keep id, label and derived tags
        con.executemany("INSERT INTO claims VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [(cid, split, i, c["claim_text"] if split == "dev" else None, c.get("claim_label"),
                          claim_tags_of(c["claim_text"]), int(index_exact[cid]))
                         for i, (cid, c) in enumerate(cs.items())])
        if split != "test":
            con.executemany("INSERT INTO claim_evidence VALUES (?, ?, ?)",
                            [(cid, r, e) for cid, c in cs.items() for r, e in enumerate(c["evidences"])])
    con.executemany("INSERT INTO evidence VALUES (?, ?, ?, ?, ?, ?)", ev_rows)
    con.executemany("INSERT INTO retrieval VALUES (?, ?, ?, ?, ?, ?, ?, ?)", retrieval_rows)
    con.executemany("INSERT INTO retrieval_summary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", summary_rows)
    con.executemany("INSERT INTO predictions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", pred_rows)
    con.executemany("INSERT INTO training_history VALUES (?, ?, ?, ?, ?, ?, ?)", hist_rows)
    con.executemany("INSERT INTO sweeps VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [(cfg, param, r["value"], r["precision"], r["recall"], r["f"], r["avg_retrieved"],
                      r["fallback_share"]) for cfg, s in retrieval["sweeps"].items() for param, rows in s.items()
                     for r in rows])
    con.executemany("INSERT INTO vectorizer_terms VALUES (?, ?, ?, ?)", term_rows)
    con.executemany("INSERT INTO token_table VALUES (?, ?, ?, ?, ?, ?)", token_rows)
    con.executemany("INSERT INTO passage_lengths VALUES (?, ?, ?, ?, ?, ?)", length_rows)
    con.commit()
    con.execute("VACUUM")
    con.close()
    print(f"wrote {DB_PATH} ({DB_PATH.stat().st_size / 1e6:.1f} MB)", flush=True)

    # ---- generated TS data modules ------------------------------------------------------
    TS_DATA.mkdir(parents=True, exist_ok=True)
    automaton = contractions.ts_leftovers_slang.automaton  # what contractions.fix() uses by default
    entries = sorted((k, length, norm) for k, (length, norm) in automaton.items())
    header = ("// GENERATED by scripts/build_web_data.py - do not edit.\n"
              "// Source: the `contractions` 0.1.73 package (MIT), exported from the TextSearch automaton that\n"
              "// `contractions.fix(text)` uses (leftovers=True, slang=True).\n")
    body = ",\n".join(f"  [{json.dumps(k, ensure_ascii=False)}, {length}, {json.dumps(v, ensure_ascii=False)}]"
                      for k, length, v in entries)
    (TS_DATA / "contractions-data.ts").write_text(
        header + "export const CONTRACTION_ENTRIES: ReadonlyArray<readonly [string, number, string]> = [\n"
        + body + ",\n];\n")
    words = sorted(set(stopwords.words("english")))
    (TS_DATA / "stopwords-data.ts").write_text(
        "// GENERATED by scripts/build_web_data.py - do not edit.\n"
        f"// NLTK English stopword list ({len(words)} words), as used by the 2024 notebook.\n"
        "export const ENGLISH_STOPWORDS: readonly string[] = [\n"
        + "\n".join(f"  {json.dumps(w)}," for w in words) + "\n];\n")

    # ---- parity fixtures ----------------------------------------------------------------
    FIXTURES.mkdir(parents=True, exist_ok=True)
    edge_cases = [
        "", "   ", "!!!???", "sentence.abc", "[South Australia] has the most expensive electricity in the world.",
        "I can't believe it's not butter! They're gonna win, y'all.",
        "I'M sure you DON'T know; Don't worry, dOn'T panic — o'clock",
        "Ain't nobody cannot wanna gimme that 'tis lemme gotta",
        "He's here; we'd go; I'll see; who're they?",
        "The U.S. emitted 5.1 Gt CO₂ in 2019 — that's ~15% of the world’s total.",
        "“Arctic land stores about twice as much carbon as the atmosphere,” he said.",
        "‘This study goes beyond statistical correlations,’ he said.",
        "naïve café résumé Zürich São Paulo Ångström",
        "Jan. 5th, 2020 and Feb. 2021: CO2 at 415ppm",
        "NASA's GISS data show 1.1°C of warming since the 1880s.",
        "全球变暖 is real; 🔥 heatwaves\tare\nbecoming common",
        "well-known non-linear state-of-the-art e-mail",
        "It’s the sun’s fault, isn’t it? We’ve known since ’79.",
        "ARE YOU KIDDING? Y'ALL CAN'T BE SERIOUS",
        "climate climates climatic climatology warming warmed warmer generalizations oscillators",
    ]
    rng = random.Random(7)
    # dev claims (already public on the site), the hand-written free-text claims and indexed passages;
    # train/test claim texts are not redistributed
    texts = (edge_cases + [c["claim_text"] for c in claims["dev"].values()]
             + [ex["text"] for ex in EXAMPLES] + HELDOUT
             + [r[2] for r in rng.sample(ev_rows, 600)])
    (FIXTURES / "preprocess.json").write_text(json.dumps(
        [{"text": t, "stems": O.preprocess_and_tokenize(t)} for t in texts], ensure_ascii=False))
    vocab_words = set()
    for t in texts + [c["claim_text"] for c in claims["train"].values()]:
        from nltk.tokenize import word_tokenize
        stripped = contractions.fix(t).lower()
        for ch in "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~":
            stripped = stripped.replace(ch, " " + ch + " ")
        stripped = stripped.translate(str.maketrans("", "", "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"))
        vocab_words |= {w for w in word_tokenize(stripped) if w.isalpha()}
    (FIXTURES / "porter.json").write_text(json.dumps(
        {w: O.stemmer.stem(w) for w in sorted(vocab_words)}, ensure_ascii=False))
    # numpy's (unstable) introsort argsort, which decided the zero-weight keyword padding
    nrng = np.random.default_rng(0)
    cases = []
    for n in (1, 2, 5, 16, 17, 40, 300, 5000, 20000):
        a = np.zeros(n)
        k = max(1, n // 400)
        a[nrng.choice(n, size=k, replace=False)] = nrng.random(k)
        cases.append(a)
    cases += [nrng.integers(0, 4, 500).astype(float), np.repeat([3.0, 1.0, 2.0], 50)]
    (FIXTURES / "argsort.json").write_text(json.dumps([
        {"n": len(c), "nonzero": [[int(i), float(c[i])] for i in np.flatnonzero(c)],
         "tail": np.argsort(c)[-40:].tolist()} for c in cases]))
    # full-corpus selections of the Try-it examples and the held-out free-text claims
    keep = lambda r: {"ids": r["ids"], "path": r["path"], "combined": [x["combined"] for x in r["scores"]]}
    (FIXTURES / "free-text.json").write_text(json.dumps({
        group: [{"text": r["text"], "tags": r["tags"], **{name: keep(r[name]) for name in CONFIGS}}
                for r in retrieval["free_text"][group]]
        for group in ("examples", "heldout")
    }, ensure_ascii=False, indent=1))
    print(f"fixtures: {len(texts)} texts, {len(vocab_words)} stem pairs; done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
