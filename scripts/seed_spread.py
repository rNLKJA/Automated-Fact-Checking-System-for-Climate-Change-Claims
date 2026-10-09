# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = [
#   "torch==2.3.0",
#   "numpy>=1.24,<2",
#   "pandas==2.0.3",
#   "scikit-learn==1.2.2",
#   "scipy>=1.10,<1.14",
#   "nltk==3.8.1",
#   "contractions==0.1.73",
#   "tqdm",
# ]
# ///
"""Training-seed spread for the 2024 classifiers.

The site's classifier is ONE retrain of the notebook's Transformer (seed 42).
This script retrains the Transformer and the LSTM with the notebook's exact code
and hyper-parameters under several seeds, to show how much of every number is
the luck of one training run. It changes nothing the site already uses: the
seed-42 model, `web/data/climate.db` and the checkpoints from
`train_classifier.py` are left alone (checkpoints here get their own names).

For each seed and model it records the best epoch (chosen on dev with gold
evidence, as the notebook does), that validation accuracy, and the model's dev
predictions on the team's saved 2024 retrieved evidence (notebook protocol:
batches of 16 in file order) and on gold evidence.

Writes web/data/seed-spread.json. Run from the repository root after steps 0-2:

    uv run scripts/seed_spread.py            # about 7 minutes per seed on a laptop CPU
"""

from __future__ import annotations

import json
import time

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

import original as O
import train_classifier as T

SEEDS = [42, 1, 2, 3, 4]
OUT = O.ROOT / "web" / "data" / "seed-spread.json"


def main() -> None:
    t0 = time.time()
    torch.set_num_threads(max(1, torch.get_num_threads()))
    device = torch.device("cpu")
    retrieval = json.load(open(T.BUILD / "retrieval.json"))
    evidence_df = T.load_json_to_dataframe(O.DATA / "evidence.json")
    train_df = T.load_json_to_dataframe(O.DATA / "train-claims.json")
    dev_df = T.load_json_to_dataframe(O.DATA / "dev-claims.json")
    train_data = T.combine_claims_evidence(train_df, evidence_df, T.label_mapping)
    dev_data = T.combine_claims_evidence(dev_df, evidence_df, T.label_mapping)
    vocab = T.build_vocab(train_data)
    tok = T.CustomTokenizer(vocab)
    train_loader = T.create_data_loader(train_data, tok, max_len=128, batch_size=16, is_test=False)
    dev_loader = T.create_data_loader(dev_data, tok, max_len=128, batch_size=16, is_test=False)

    evidence_dict = evidence_df.set_index("index")[0].to_dict()
    dev = json.load(open(O.DATA / "dev-claims.json"))
    retrieved = {cid: v["saved_2024"] for cid, v in retrieval["dev"].items()}
    gold_ev = {cid: v["evidences"] for cid, v in dev.items()}
    ret_data = T.combine_claims_evidence_test(dev, evidence_dict, retrieved)
    gold_data = T.combine_claims_evidence_test(dev, evidence_dict, gold_ev)
    ret_loader = T.create_data_loader(ret_data, tok, 128, 16, is_test=True)
    gold_loader = T.create_data_loader(gold_data, tok, 128, 16, is_test=True)
    claim_ids = list(ret_data["claim_id"])
    print(f"data ready in {time.time() - t0:.0f}s; vocab {len(vocab):,}", flush=True)

    def labels_of(logits):
        return [T.reverse_label_mapping[int(i)] for i in logits.argmax(dim=1)]

    def build(kind: str):
        if kind == "transformer":
            return T.TransformerModel(len(vocab), 256, 8, 6, len(T.label_mapping), 0.1).to(device)
        return T.LSTM(len(vocab), 256, 4, len(T.label_mapping), 0.1).to(device)

    runs: dict[str, list[dict]] = {"transformer": [], "lstm": []}
    for seed in SEEDS:
        for kind in ("transformer", "lstm"):
            ts = time.time()
            T.seed_everything(seed)
            model = build(kind)
            name = f"spread_{kind}_seed{seed}"
            history = T.train_model(
                model, train_loader, dev_loader, nn.CrossEntropyLoss().to(device),
                optim.Adam(model.parameters(), lr=1e-4), device, epochs=10, model_name=name,
            )
            model.load_state_dict(torch.load(T.MODELS / f"best_{name}_state.bin"))
            model.eval()
            pred_ret = labels_of(T.predict_logits(model, ret_loader, device))
            pred_gold = labels_of(T.predict_logits(model, gold_loader, device))
            runs[kind].append(
                {
                    "seed": seed,
                    "best_epoch": history["best_epoch"],
                    "best_val_acc": max(history["val_acc"]),
                    "final_val_acc": history["val_acc"][-1],
                    "val_acc": history["val_acc"],
                    "predictions_retrieved": pred_ret,
                    "predictions_gold": pred_gold,
                }
            )
            gold_labels = [dev[c]["claim_label"] for c in claim_ids]
            acc = float(np.mean([a == b for a, b in zip(pred_ret, gold_labels)]))
            print(f"[{kind} seed {seed}] best epoch {history['best_epoch']} "
                  f"val {max(history['val_acc']):.4f} | retrieved acc {acc:.4f} ({time.time() - ts:.0f}s)",
                  flush=True)

    out = {
        "generated_by": "scripts/seed_spread.py",
        "torch": torch.__version__,
        "seeds": SEEDS,
        "claim_ids": claim_ids,
        "protocol": "best epoch by dev accuracy on gold evidence; predictions in batches of 16 in file order",
        "runs": runs,
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(O.ROOT)} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
