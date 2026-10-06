<div align="center">

# Climate Claim Checker

**Automated fact-checking of climate-change claims, from a 2024 University of Melbourne NLP project, rebuilt and re-run as a web app.**

[![CI](https://github.com/rNLKJA/Automated-Fact-Checking-System-for-Climate-Change-Claims/actions/workflows/ci.yml/badge.svg)](https://github.com/rNLKJA/Automated-Fact-Checking-System-for-Climate-Change-Claims/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-uv_scripts-3776AB?logo=python&logoColor=white)
[![University of Melbourne](https://img.shields.io/badge/University_of_Melbourne-COMP90042-002250)](https://handbook.unimelb.edu.au/subjects/comp90042)

**Live demo:** [comp90042-climate-fact-check.vercel.app](https://comp90042-climate-fact-check.vercel.app)

</div>

## Overview

This repository holds a group project for **COMP90042 Natural Language Processing**
(The University of Melbourne, 2024 Semester 1, Wed5PM Group 1).

**The brief, paraphrased:** given a claim about climate science, find supporting or
contradicting passages in a knowledge source of 1,208,827 Wikipedia sentences, then label
the claim `SUPPORTS`, `REFUTES`, `NOT_ENOUGH_INFO` or `DISPUTED`. Pretrained language models
and embeddings were not allowed, so everything had to be trained from scratch on 1,228
labelled claims. Systems were scored on evidence-retrieval F-score, label accuracy and their
harmonic mean.

**What the team built:** a two-stage pipeline.

1. **Retrieval.** Every passage was tagged with its top TF-IDF keywords. A claim's stemmed
   words are matched against those tags by cosine similarity on a second, 1,000-term TF-IDF
   model plus the share of tags in common. Thresholds pick the evidence.
2. **Classification.** A Transformer encoder trained from scratch (compared with an LSTM)
   reads the claim and evidence stems and predicts the verdict.

**What the revival adds:** a Next.js app where you can type any claim and run the original
pipeline, browse all 154 dev claims (gold vs retrieved evidence, per-claim precision and recall,
verdicts), see the charts behind the report, and follow one claim through every stage. Every
algorithm is a TypeScript port tested for parity against the original Python. Nothing was
re-tuned.

## Results: reported vs reproduced

| Metric (dev set unless noted)             |              2024 report | 2026 re-run                                                       |
| ----------------------------------------- | -----------------------: | ----------------------------------------------------------------- |
| Evidence retrieval F-score                |                  0.04299 | **0.04299** (exact, full 1.19M-passage corpus)                    |
| Claim accuracy                            |                  0.55844 | 0.383 (classifier retrained: the 2024 weights were never saved)   |
| Harmonic mean                             |                  0.07984 | 0.077                                                             |
| Test set (course leaderboard), F / A / HM | 0.0331 / 0.4079 / 0.0612 | test labels were never released                                   |
| Notebook's own final-cell F-score         |                 0.011205 | **0.011205** (exact)                                              |
| Saved 2024 retrieval lists (dev + test)   |               307 claims | 303 with identical scores (244 identical passages), 4 unexplained |
| Report Table 1 passage-length counts      |                7 buckets | **identical**                                                     |

Retrieval was the weak link in 2024 and still is: the gold passage was found for only 13 of
154 dev claims. The retrained Transformer tracks the 2024 training log closely (epoch-1 train
loss 1.1448 vs 1.1442), although its best validation accuracy is 57.8% against 60.4% in 2024. On
retrieved evidence it scores below the 44.2% you would get by always answering "supports". The
notebook's own last evaluation cell printed 35.1%.

Where the re-run differs from a saved 2024 retrieval list, it is because pandas' unstable sort
kept a different one of several exactly tied passages. The exceptions are 4 lists (claim-540,
claim-1160, claim-1582, claim-2329) that look like top-6 fallback lists although passages pass
the filter, which points to 2024 logic that is not in the notebook.

### Four things the re-run revealed

- **The Transformer never attended across words.** The encoder was built without
  `batch_first=True`, so attention mixed the 16 claims of a mini-batch instead of the words of
  a claim. On a single claim the whole network reduces _exactly_ to
  `bias + mean of per-token scores`: a 5,886 × 4 table that matches PyTorch to 7.7e-7. That is
  how the web app runs it and explains it.
- **The committed notebook is not the submitted code.** The saved 2024 outputs come from a
  rule scoring `sim + overlap`. The notebook adds the similarity twice, and its final cell
  passes raw claim text instead of stems, hence F = 0.011. All three variants are reproduced.
- **An Arabic word in 14% of evidence tags.** numpy's unstable `argsort` padded short
  passages' top-10 keywords with zero-weight features. The last vocabulary entry, `محمد`, is
  alphabetic, so it landed in 167,592 passages' tags. The TypeScript port reimplements numpy's
  introsort to reproduce the tags exactly.
- **Two verdicts are never predicted.** Class imbalance (42% `SUPPORTS`, 10% `DISPUTED`) leaves
  the model answering only `SUPPORTS` or `NOT_ENOUGH_INFO`.

## Tech stack

| Layer   | 2024 original                                      | 2026 revival                                                                           |
| ------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Runtime | Python 3.10 on Google Colab                        | Next.js 16 (App Router, Server Components), React 19, TypeScript (strict)              |
| NLP     | NLTK, contractions, scikit-learn `TfidfVectorizer` | Faithful TS ports in `web/src/lib` (Porter, Treebank tokenizer, TF-IDF, numpy argsort) |
| Models  | PyTorch Transformer + LSTM                         | Retrained with the original code; Transformer exported as an exact token table         |
| Data    | pandas, pickles on Google Drive                    | Read-only SQLite (`better-sqlite3`), built by reproducible `uv` scripts                |
| UI      | –                                                  | Tailwind CSS v4, shadcn/ui, Recharts, next-themes, lucide                              |
| Quality | –                                                  | vitest parity suite, ESLint, Prettier, GitHub Actions CI                               |

## Repository structure

```
.
├── README.md
├── LICENSE
├── .github/workflows/ci.yml     # lint, format, typecheck, test, build (web/)
├── coursework/                  # the original 2024 submission, unchanged (see its README)
│   ├── COMP90042_Wed5PM_Group1.ipynb
│   ├── COMP90042_Wed5PM_Group1.pdf   # the team's report
│   ├── notebooks/  scripts/  data/  _archive/
│   └── requirements.txt  pyproject.toml
├── scripts/                     # uv scripts that re-run the original code (see scripts/README.md)
│   ├── original.py              # notebook functions, verbatim
│   ├── free_text_claims.py      # Try-it examples + held-out claims that measure the pruned index
│   ├── fetch_data.py            # step 0: verify/link inputs into .cache/ (MD5-pinned)
│   ├── build_retrieval.py       # step 1: retrieval over all 1.19M passages, parity, sweeps
│   ├── train_classifier.py      # step 2: retrain Transformer + LSTM, export token table
│   └── build_web_data.py        # step 3: web/data/climate.db, TS data modules, fixtures
└── web/                         # the deployable Next.js app (Vercel root)
    ├── data/climate.db          # read-only SQLite artefact (13 MB)
    └── src/
        ├── app/                 # /, /try, /explore, /explore/[claimId], /results, /method, /api/check
        ├── components/          # ui/ (shadcn), layout/, common/, evidence/, explore/, try/, charts/
        ├── lib/                 # framework-free ports + vitest parity tests + fixtures
        ├── server/              # server-only data layer and the Try-it pipeline
        └── test/
```

## Local development

Requirements: Node 22+ and pnpm 10.

```bash
cd web
pnpm install
pnpm dev            # http://localhost:3309
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The app needs no environment variables, no database server and no API keys. Everything is
static or read from `web/data/climate.db` on the server. Deploy with `web/` as the Vercel root
directory.

## Data artefacts

`web/data/climate.db` is generated, not hand-made. To rebuild it you need the course corpus
and the team's 2024 artefacts. They are large (`evidence.json` alone is 174 MB) and are never
committed: they live in the gitignored `.cache/`. With [uv](https://docs.astral.sh/uv/)
installed, from the repository root:

```bash
uv run scripts/fetch_data.py --from "/path/to/local/copy"   # or --download (2024 URLs)
uv run scripts/build_retrieval.py      # ~6 min
uv run scripts/train_classifier.py     # ~7 min on CPU
uv run scripts/build_web_data.py       # ~1 min, deterministic (byte-identical output)
```

The database contains:

- **Claims:** 1,228 train, 154 dev and 153 test claims as ids, labels, stemmed tags and gold
  evidence ids. Only the 154 dev claims keep their text (the Explore pages show them); train and
  test claim texts are not redistributed.
- **A pruned evidence index:** 39,666 passages, not the full corpus. It holds every gold
  passage for train and dev, every passage either rule could select for any train, dev or test
  claim, every passage it could select for the Try-it examples, and a seeded random sample of
  25,000. Each passage keeps the team's tags and its exact row of their TF-IDF matrix. For every
  dataset claim and example the TS port therefore returns the full-corpus selection (tested).
  For new text it may not: on 60 hand-written climate claims that played no part in building
  the index (`scripts/free_text_claims.py`), it picked the same passages as the full 1.19M
  search 39 times (35 of 52 on the filtered path, 4 of 8 on the fallback path). The Try-it page
  says on every result whether the selection is verified or comes from the subset.
- **Retrieval runs** (saved 2024, submitted rule, notebook rule, notebook final cell) with
  scores and per-claim P/R/F, plus threshold sweeps.
- **Predictions** under three protocols, training histories (the 2024 log parsed from the notebook
  and the 2026 retrain), both vectorizers' vocabularies and IDF weights, and the Transformer's
  token table.

The app only reads this file, so there is no admin area or remote database: to browse the
records, open `web/data/climate.db` in any SQLite browser (for example
[DB Browser for SQLite](https://sqlitebrowser.org)) or query it directly:

```bash
sqlite3 web/data/climate.db ".tables"
sqlite3 web/data/climate.db "SELECT claim_id, label, claim_text FROM claims WHERE split = 'dev' LIMIT 5"
sqlite3 web/data/climate.db "SELECT key, value FROM meta WHERE key = 'free_text_parity'"
```

`web/src/lib/__fixtures__/` holds Python ground truth for the parity tests (preprocessing,
Porter stems, numpy argsort, and the full-corpus selections for the free-text claims).

## Credits

| Team member             | 2024 contribution                                                                |
| ----------------------- | -------------------------------------------------------------------------------- |
| Sunchuangyu (Rin) Huang | System design, preprocessing, TF-IDF evidence retrieval, report and presentation |
| Wei Zhao                | Transformer and LSTM classifiers: design, training, evaluation, model selection  |
| Xuan Wang               | Retrieval testing and debugging, literature review, report and presentation      |

The 2026 web revival was made by Rin Huang. The task and datasets come from the subject's
public [COMP90042_2024](https://github.com/drcarenhan/COMP90042_2024) project repository.
The evidence passages are Wikipedia sentences.

## Academic integrity

The original submission is preserved unchanged in [`coursework/`](coursework/) for reference.
It holds the notebook and the team's report. The assignment specification is paraphrased here,
not reproduced, and neither the full course corpus nor the train and test claim texts are
redistributed. The site serves only derived
artefacts and the pruned index needed for the demo. Current students of COMP90042 should not
copy this work.

## License

[MIT](LICENSE)
