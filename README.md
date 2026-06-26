<div align="center">

# Automated Fact-Checking System for Climate-Change Claims

TF-IDF evidence retrieval + Transformer / LSTM claim classification.

[![Python](https://img.shields.io/badge/Python-3.8-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-deep_learning-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-TF--IDF-F7931E?logo=scikitlearn&logoColor=white)](https://scikit-learn.org/)
[![spaCy](https://img.shields.io/badge/spaCy-NLP-09A3D5?logo=spacy&logoColor=white)](https://spacy.io/)
[![University of Melbourne](https://img.shields.io/badge/University_of_Melbourne-COMP90042-002250)](https://handbook.unimelb.edu.au/subjects/comp90042)

</div>

## Overview

A group project for the University of Melbourne's **COMP90042 Natural Language
Processing** subject (2024 Semester 1). Given a claim about climate science, the system
must **(1)** retrieve the most relevant evidence passages from a large knowledge source,
and **(2)** classify the claim against that evidence as one of `SUPPORTS`, `REFUTES`,
`NOT_ENOUGH_INFO` or `DISPUTED`.

The unchecked spread of unverified statements about climate science distorts public
understanding, which makes automated fact-checking a worthwhile problem. For example:

> **Claim:** The Earth's climate sensitivity is so low that a doubling of atmospheric
> CO₂ will result in a surface temperature change on the order of 1 °C or less.
>
> **Evidence:** The 1990 IPCC First Assessment Report estimated equilibrium climate
> sensitivity to a doubling of CO₂ at between 1.5 °C and 4.5 °C, with a best guess of
> 2.5 °C.

The evidence does not support the claim — so a good system should retrieve those
passages and label the claim accordingly.

## Approach

| Stage                    | Method                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Evidence retrieval**   | TF-IDF vectorisation over the evidence corpus, ranking passages by similarity to the claim.             |
| **Claim classification** | A Transformer classifier and an LSTM classifier (trained from scratch) compared on the four-class task. |
| **Preprocessing**        | spaCy / NLTK tokenisation, contraction expansion and cleaning.                                          |

Both classifiers are trained only on the provided data, with no pretrained embeddings
or checkpoints, per the project rules.

## Evaluation

The system is scored on three metrics:

1. **Evidence Retrieval F-score** — precision/recall of retrieved evidence passages
   against the ground truth, averaged over all claims.
2. **Claim Classification Accuracy** — standard accuracy of the four-class label
   prediction.
3. **Harmonic Mean of F and A** — the headline metric used to rank systems on Codalab.

`scripts/eval.py` (the official course evaluation script) computes all three.

## Repository structure

| Path                            | Contents                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| `COMP90042_Wed5PM_Group1.ipynb` | Main notebook — data processing, retrieval, both models, results.      |
| `notebooks/`                    | Copy of the main notebook.                                             |
| `COMP90042_Wed5PM_Group1.pdf`   | Final written report.                                                  |
| `scripts/data_downloader.py`    | Downloads the claim/evidence datasets (evidence via Google Drive).     |
| `scripts/eval.py`               | Official evaluation script (provided).                                 |
| `data/`                         | Dataset notes; the large `evidence.json` is downloaded, not committed. |

## Tech stack

| Purpose        | Tools                       |
| -------------- | --------------------------- |
| Retrieval      | scikit-learn (TF-IDF)       |
| Classification | PyTorch (Transformer, LSTM) |
| Preprocessing  | spaCy, NLTK, contractions   |
| Data handling  | pandas, polars, NumPy       |
| Environment    | Python 3.8, Jupyter         |

## Getting started

```bash
# 1. install dependencies
pip install -r requirements.txt

# 2. download the datasets (claims + evidence)
cd scripts
python -c "from data_downloader import ClimateFactCheckerDataDownloader; ClimateFactCheckerDataDownloader().download_all()"
```

> `evidence.json` (~174 MB) is too large for GitHub and is fetched from Google Drive by
> the downloader — see [`data/README.md`](data/README.md).

Then open `COMP90042_Wed5PM_Group1.ipynb` and run it top to bottom. Evaluate predictions
with:

```bash
python scripts/eval.py --predictions dev-claims-predictions.json --groundtruth data/dev-claims.json
```

## Team

| Name              | Student ID |
| ----------------- | ---------- |
| Xuan Wang         | 1329456    |
| Wei Zhao          | 1118649    |
| Sunchuangyu Huang | 1118472    |

📄 Report: [Overleaf](https://www.overleaf.com/read/sgchwdbmvjbq#c47aff) ·
Built on the [2024 COMP90042 project description](https://github.com/drcarenhan/COMP90042_2024/tree/main).

---

<div align="center">
2024 © Xuan · Wei · Sunchuangyu
</div>
