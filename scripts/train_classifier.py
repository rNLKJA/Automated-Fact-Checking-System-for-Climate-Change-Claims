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
"""Step 2 - retrain the ORIGINAL from-scratch Transformer and LSTM classifiers.

The notebook never saved model weights, so they are retrained here with the
notebook's exact code and hyper-parameters (cells 33-44): vocabulary built from
the stemmed train claims + gold evidence, sequences of 128 ids, batch size 16,
no shuffling, Adam(lr=1e-4), CrossEntropyLoss, 10 epochs, best epoch chosen by
validation (dev, gold evidence) accuracy. The only addition is a fixed seed.

Outputs (``.cache/build`` unless noted):
  classifier.json   histories, dev predictions (batch protocol + single-claim),
                    metrics, and the exported single-claim token table.
  ../models/*.bin   best Transformer / LSTM state dicts (gitignored).

Single-claim export: the notebook's encoder is *not* batch_first, so
``nn.TransformerEncoder`` treats the batch axis as the sequence axis and
self-attention mixes the (up to) 16 claims of a mini-batch. For a batch of one
claim the attention therefore spans a single element and every one of the 128
positions is transformed independently; with the mean-pool + linear head the
logits become ``b + mean_t g[id_t]`` for a per-token table ``g`` (|V| x 4).
That table is exported exactly and verified against PyTorch below.

Usage:  uv run scripts/train_classifier.py
"""

from __future__ import annotations

import json
import math
import random
import time

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from tqdm.auto import tqdm

import original as O
from original import preprocess_and_tokenize

SEED = 42
BUILD = O.CACHE / "build"
MODELS = O.CACHE / "models"
MODELS.mkdir(parents=True, exist_ok=True)
label_mapping = O.LABEL_MAPPING
reverse_label_mapping = O.REVERSE_LABEL_MAPPING


def seed_everything(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


# --- cell 33 ----------------------------------------------------------------
def load_json_to_dataframe(file_path):
    df = pd.read_json(file_path, orient="index").reset_index()
    return df


def combine_claims_evidence(claims_df, evidence_df, label_mapping):
    evidence_dict = evidence_df.set_index("index")[0].to_dict()
    data = []
    for _, row in tqdm(claims_df.iterrows(), total=len(claims_df)):
        claim_texts = preprocess_and_tokenize(row["claim_text"])
        claim_text = " ".join(claim_texts)
        claim_label = label_mapping[row["claim_label"]]
        evidence_texts = [
            preprocess_and_tokenize(evidence_dict[evidence_id])
            for evidence_id in row["evidences"]
        ]
        evidence_text = " ".join([" ".join(evidence) for evidence in evidence_texts])
        data.append({"claim_text": claim_text, "claim_label": claim_label, "evidence_text": evidence_text})
    return pd.DataFrame(data)


# --- cell 35 ----------------------------------------------------------------
class CustomTokenizer:
    def __init__(self, vocab):
        self.vocab = vocab
        self.cls_token = "[CLS]"
        self.sep_token = "[SEP]"
        self.pad_token = "[PAD]"
        self.cls_token_id = self.vocab[self.cls_token]
        self.sep_token_id = self.vocab[self.sep_token]
        self.pad_token_id = self.vocab[self.pad_token]

    def encode(self, text, max_length, padding="max_length", truncation=True):
        tokens = [self.cls_token] + text.split() + [self.sep_token]
        token_ids = [self.vocab.get(token, self.vocab["<unk>"]) for token in tokens]
        if truncation and len(token_ids) > max_length:
            token_ids = token_ids[: max_length - 1] + [self.sep_token_id]
        if padding == "max_length":
            padding_length = max_length - len(token_ids)
            token_ids += [self.pad_token_id] * padding_length
        return {"input_ids": torch.tensor(token_ids, dtype=torch.long)}


class ClaimsDataset(Dataset):
    def __init__(self, dataframe, tokenizer, max_len, is_test=False):
        self.data = dataframe
        self.tokenizer = tokenizer
        self.max_len = max_len
        self.is_test = is_test

    def __len__(self):
        return len(self.data)

    def __getitem__(self, index):
        claim_text = str(self.data.iloc[index]["claim_text"])
        evidence_text = str(self.data.iloc[index]["evidence_text"])
        label = int(self.data.iloc[index]["claim_label"]) if not self.is_test else -1
        combined_text = claim_text + " " + evidence_text
        encoding = self.tokenizer.encode(combined_text, max_length=self.max_len, padding="max_length", truncation=True)
        item = {"input_ids": encoding["input_ids"], "claim_text": claim_text, "evidence_text": evidence_text}
        if not self.is_test:
            item["label"] = torch.tensor(label, dtype=torch.long)
        return item


def create_data_loader(df, tokenizer, max_len, batch_size, num_workers=0, is_test=False):
    datasets = ClaimsDataset(dataframe=df, tokenizer=tokenizer, max_len=max_len, is_test=is_test)
    return DataLoader(datasets, batch_size=batch_size, num_workers=num_workers)


def build_vocab(data):
    vocab = {"<unk>": 0, "[CLS]": 1, "[SEP]": 2, "[PAD]": 3}
    for _, row in data.iterrows():
        tokens = (row["claim_text"] + " " + row["evidence_text"]).split()
        for token in tokens:
            if token not in vocab:
                vocab[token] = len(vocab)
    return vocab


# --- cell 37 ----------------------------------------------------------------
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super(PositionalEncoding, self).__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0).transpose(0, 1)
        self.register_buffer("pe", pe)

    def forward(self, x):
        return x + self.pe[: x.size(0), :]


class TransformerModel(nn.Module):
    def __init__(self, input_dim, model_dim, num_heads, num_encoder_layers, num_classes, dropout=0.1):
        super(TransformerModel, self).__init__()
        self.embedding = nn.Embedding(input_dim, model_dim)
        self.pos_encoder = PositionalEncoding(model_dim)
        encoder_layer = nn.TransformerEncoderLayer(model_dim, num_heads, dim_feedforward=512, dropout=dropout)
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_encoder_layers)
        self.fc_out = nn.Linear(model_dim, num_classes)
        self.dropout = nn.Dropout(dropout)

    def forward(self, src, src_mask=None):
        src = self.embedding(src) * math.sqrt(src.size(1))
        src = self.dropout(self.pos_encoder(src))
        output = self.transformer_encoder(src, src_key_padding_mask=src_mask)
        output = self.fc_out(output.mean(dim=1))
        return output


# --- cell 39 ----------------------------------------------------------------
class LSTM(nn.Module):
    def __init__(self, input_dim, model_dim, num_layers, num_classes, dropout=0.1):
        super(LSTM, self).__init__()
        self.embedding = nn.Embedding(input_dim, model_dim)
        self.lstm = nn.LSTM(model_dim, model_dim, num_layers, batch_first=True, dropout=dropout)
        self.fc_out = nn.Linear(model_dim, num_classes)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        x = self.embedding(x)
        x, (hn, cn) = self.lstm(x)
        x = self.dropout(x)
        x = self.fc_out(x[:, -1, :])
        return x


# --- cell 42 ----------------------------------------------------------------
def train_epoch(model, data_loader, loss_fn, optimizer, device):
    model.train()
    losses = []
    correct_predictions = 0
    for batch in data_loader:
        input_ids = batch["input_ids"].to(device)
        labels = batch["label"].to(device)
        outputs = model(input_ids)
        _, preds = torch.max(outputs, dim=1)
        loss = loss_fn(outputs, labels)
        correct_predictions += torch.sum(preds == labels)
        losses.append(loss.item())
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()
    return np.mean(losses), correct_predictions.double() / len(data_loader.dataset)


def eval_model(model, data_loader, criterion, device):
    model.eval()
    losses = []
    correct_predictions = 0
    with torch.no_grad():
        for batch in data_loader:
            input_ids = batch["input_ids"].to(device)
            labels = batch["label"].to(device)
            outputs = model(input_ids)
            loss = criterion(outputs, labels)
            losses.append(loss.item())
            _, preds = torch.max(outputs, dim=1)
            correct_predictions += torch.sum(preds == labels)
    return np.mean(losses), correct_predictions.double() / len(data_loader.dataset)


def train_model(model, train_data_loader, val_data_loader, loss_fn, optimizer, device, epochs, model_name="model"):
    history = {"train_loss": [], "val_loss": [], "train_acc": [], "val_acc": []}
    best_accuracy = 0
    best_epoch = 0
    for epoch in range(epochs):
        t = time.time()
        train_loss, train_acc = train_epoch(model, train_data_loader, loss_fn, optimizer, device)
        val_loss, val_acc = eval_model(model, val_data_loader, loss_fn, device)
        print(f"[{model_name}] epoch {epoch + 1}/{epochs} train loss {train_loss:.4f} acc {train_acc:.4f} | "
              f"val loss {val_loss:.4f} acc {val_acc:.4f}  ({time.time() - t:.0f}s)")
        history["train_loss"].append(float(train_loss))
        history["val_loss"].append(float(val_loss))
        history["train_acc"].append(train_acc.item())
        history["val_acc"].append(val_acc.item())
        if val_acc > best_accuracy:
            torch.save(model.state_dict(), MODELS / f"best_{model_name}_state.bin")
            best_accuracy = val_acc
            best_epoch = epoch + 1
    history["best_epoch"] = best_epoch
    return history


# --- cell 51 ----------------------------------------------------------------
def combine_claims_evidence_test(claims, evidence_dict, retrieved):
    data = []
    for cid, claim in claims.items():
        claim_text = " ".join(preprocess_and_tokenize(claim["claim_text"]))
        evidence_texts = [preprocess_and_tokenize(evidence_dict[e]) for e in retrieved[cid]]
        evidence_text = " ".join([" ".join(ev) for ev in evidence_texts])
        data.append({"claim_id": cid, "claim_text": claim_text, "evidence_text": evidence_text})
    return pd.DataFrame(data)


def evidence_f(retrieved_ids, gold_ids):
    """Per-claim evidence F exactly as coursework/scripts/eval.py."""
    top = set(retrieved_ids)
    correct = sum(1 for g in gold_ids if g in top)
    if not retrieved_ids or correct == 0:
        return 0.0
    r, p = correct / len(gold_ids), correct / len(retrieved_ids)
    return 2 * p * r / (p + r)


def predict_logits(model, data_loader, device):
    model = model.eval()
    out = []
    with torch.no_grad():
        for d in data_loader:
            out.append(model(d["input_ids"].to(device)).cpu())
    return torch.cat(out)


@torch.no_grad()
def export_token_table(model: TransformerModel, max_len: int = 128):
    """Per-token logit contributions for a batch of ONE sequence (see module docstring)."""
    model.eval()
    emb = model.embedding.weight * math.sqrt(max_len)  # src.size(1) == max_len in forward()
    x = emb + model.pos_encoder.pe[0]  # batch axis has size 1 -> pe[0] for every position
    x = x.unsqueeze(0)  # (S=1, N=|V|, E): each token is its own "batch" element
    h = model.transformer_encoder(x)[0]  # (|V|, E)
    g = h @ model.fc_out.weight.T  # (|V|, 4), bias added once at the end
    return g.numpy().astype(np.float32), model.fc_out.bias.numpy().astype(np.float32)


def main():
    t0 = time.time()
    seed_everything(SEED)
    torch.set_num_threads(max(1, torch.get_num_threads()))
    device = torch.device("cpu")
    data_path = O.DATA
    retrieval = json.load(open(BUILD / "retrieval.json"))

    evidence_df = load_json_to_dataframe(data_path / "evidence.json")
    train_claims_df = load_json_to_dataframe(data_path / "train-claims.json")
    dev_claims_df = load_json_to_dataframe(data_path / "dev-claims.json")
    print(f"loaded evidence ({len(evidence_df):,}) in {time.time() - t0:.0f}s")

    train_data = combine_claims_evidence(train_claims_df, evidence_df, label_mapping)
    dev_data = combine_claims_evidence(dev_claims_df, evidence_df, label_mapping)
    vocab = build_vocab(train_data)
    tokenizer = CustomTokenizer(vocab)
    train_data_loader = create_data_loader(train_data, tokenizer, max_len=128, batch_size=16, is_test=False)
    dev_data_loader = create_data_loader(dev_data, tokenizer, max_len=128, batch_size=16, is_test=False)
    print(f"vocab size {len(vocab):,}")

    # Transformer (cell 37)
    seed_everything(SEED)
    model = TransformerModel(len(vocab), 256, 8, 6, len(label_mapping), 0.1).to(device)
    loss_fn = nn.CrossEntropyLoss().to(device)
    optimizer = optim.Adam(model.parameters(), lr=1e-4)
    transformer_history = train_model(model, train_data_loader, dev_data_loader, loss_fn, optimizer, device,
                                      epochs=10, model_name="transformer")

    # LSTM (cell 39)
    seed_everything(SEED)
    lstm_model = LSTM(len(vocab), 256, 4, len(label_mapping), 0.1).to(device)
    lstm_loss_fn = nn.CrossEntropyLoss().to(device)
    lstm_optimizer = optim.Adam(lstm_model.parameters(), lr=1e-4)
    lstm_history = train_model(lstm_model, train_data_loader, dev_data_loader, lstm_loss_fn, lstm_optimizer,
                               device, epochs=10, model_name="lstm")

    # Reload the best Transformer (as the notebook does before predicting)
    model.load_state_dict(torch.load(MODELS / "best_transformer_state.bin"))
    model.eval()

    # Dev predictions on RETRIEVED evidence, notebook protocol: batches of 16 in file order
    evidence_dict = evidence_df.set_index("index")[0].to_dict()
    dev = {k: v for k, v in json.load(open(data_path / "dev-claims.json")).items()}
    # the classifier input in 2024 was built from the team's saved retrieval lists
    retrieved = {cid: v["saved_2024"] for cid, v in retrieval["dev"].items()}
    gold_ev = {cid: v["evidences"] for cid, v in dev.items()}
    test_data = combine_claims_evidence_test(dev, evidence_dict, retrieved)
    loader = create_data_loader(test_data, tokenizer, max_len=128, batch_size=16, is_test=True)
    batch_logits = predict_logits(model, loader, device)
    single_logits = torch.cat([
        model(tokenizer.encode(t.claim_text + " " + t.evidence_text, max_length=128)["input_ids"].unsqueeze(0))
        for t in test_data.itertuples()
    ]).detach()

    # Same on GOLD evidence (what the training-time "val acc" measures)
    gold_data = combine_claims_evidence_test(dev, evidence_dict, gold_ev)
    gold_logits = predict_logits(model, create_data_loader(gold_data, tokenizer, 128, 16, is_test=True), device)

    # Token table + exactness check against PyTorch at batch size 1
    g, b = export_token_table(model)
    ids = torch.stack([tokenizer.encode(t.claim_text + " " + t.evidence_text, max_length=128)["input_ids"]
                       for t in test_data.itertuples()])
    table_logits = g[ids.numpy()].astype(np.float64).mean(axis=1) + b
    max_err = float(np.abs(table_logits - single_logits.numpy()).max())
    print(f"token-table vs PyTorch(batch=1) max |logit diff| = {max_err:.2e}")
    assert max_err < 1e-4

    # Test-set predictions (no public labels; Codalab is gone) - notebook protocol
    test = json.load(open(data_path / "test-claims-unlabelled.json"))
    test_ret = {cid: v["saved_2024"] for cid, v in retrieval["test"].items()}
    test_df = combine_claims_evidence_test(test, evidence_dict, test_ret)
    test_logits = predict_logits(model, create_data_loader(test_df, tokenizer, 128, 16, is_test=True), device)

    def labels_of(logits):
        return [reverse_label_mapping[int(i)] for i in logits.argmax(dim=1)]

    dev_ids = list(test_data["claim_id"])
    pred_batch = labels_of(batch_logits)
    pred_single = labels_of(single_logits)
    pred_gold = labels_of(gold_logits)
    gold_labels = [dev[c]["claim_label"] for c in dev_ids]
    acc = lambda p: float(np.mean([a == b for a, b in zip(p, gold_labels)]))
    f_mean = float(np.mean([evidence_f(retrieved[c], gold_ev[c]) for c in dev_ids]))
    hm = lambda a, f: 0.0 if a == 0 and f == 0 else 2 * a * f / (a + f)
    metrics = {
        "dev_acc_retrieved_batch": acc(pred_batch),
        "dev_acc_retrieved_single": acc(pred_single),
        "dev_acc_gold_batch": acc(pred_gold),
        "dev_f": f_mean,
        "dev_hm_batch": hm(acc(pred_batch), f_mean),
        "majority_baseline_acc": float(np.mean([l == "SUPPORTS" for l in gold_labels])),
        "token_table_max_err": max_err,
        "vocab_size": len(vocab),
        "params_transformer": int(sum(p.numel() for p in model.parameters())),
        "params_lstm": int(sum(p.numel() for p in lstm_model.parameters())),
        "seed": SEED,
        "torch": torch.__version__,
    }
    print(json.dumps(metrics, indent=1))

    softmax = lambda x: torch.softmax(x, dim=1).numpy().tolist()
    tokens = [None] * len(vocab)
    for tok, i in vocab.items():
        tokens[i] = tok
    out = {
        "metrics": metrics,
        "history": {"transformer": transformer_history, "lstm": lstm_history},
        "dev_predictions": {
            cid: {
                "batch": pred_batch[i],
                "single": pred_single[i],
                "gold_evidence": pred_gold[i],
                "single_probs": softmax(single_logits[i : i + 1])[0],
                "batch_probs": softmax(batch_logits[i : i + 1])[0],
                "gold_evidence_probs": softmax(gold_logits[i : i + 1])[0],
                "single_logits": single_logits[i].tolist(),
                "batch_logits": batch_logits[i].tolist(),
            }
            for i, cid in enumerate(dev_ids)
        },
        "test_predictions": {
            cid: {"batch": labels_of(test_logits[i : i + 1])[0], "batch_probs": softmax(test_logits[i : i + 1])[0]}
            for i, cid in enumerate(test_df["claim_id"])
        },
        "token_table": {
            "labels": [reverse_label_mapping[i] for i in range(4)],
            "max_len": 128,
            "tokens": tokens,
            "bias": b.tolist(),
            "g": g.tolist(),
        },
        "parity_inputs": [
            {"claim_id": t.claim_id, "text": t.claim_text + " " + t.evidence_text,
             "ids": ids[i].tolist(), "logits": single_logits[i].tolist()}
            for i, t in enumerate(test_data.itertuples())
        ],
    }
    with open(BUILD / "classifier.json", "w") as f:
        json.dump(out, f)
    print(f"wrote {BUILD / 'classifier.json'} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
