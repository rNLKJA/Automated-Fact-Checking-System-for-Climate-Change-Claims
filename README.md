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

## Showcase

<p align="center">
  <a href="https://comp90042-climate-fact-check.vercel.app/tour"><img src="docs/showcase/2-check-a-claim.gif" width="960" alt="Screen recording: a claim about sea levels is typed into the Try page and checked; the 2024 model's verdict, its four class probabilities, the retrieved passages and each word's contribution appear in turn."></a>
</p>

<p align="center"><em>Check a claim: the original TF-IDF retrieval and from-scratch Transformer run on a typed sentence.<br>
Captioned walkthroughs with step lists and transcripts are on the <a href="https://comp90042-climate-fact-check.vercel.app/tour"><strong>/tour</strong></a> page.</em></p>

### Key features

|                                                                                                                                                                       |                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Landing page, light theme](docs/showcase/01-landing-light.png)<br>**Landing.** The question, the pipeline and a real dev claim with both verdicts.                  | ![Landing page, dark theme](docs/showcase/02-landing-dark.png)<br>**Dark theme.** The same page, dark.                                                                      |
| ![Try a claim: verdict](docs/showcase/03-try-verdict.png)<br>**Check a claim.** The verdict and all four class probabilities, beside the dev-accuracy CI.             | ![Try a claim: retrieved evidence](docs/showcase/04-try-evidence.png)<br>**Retrieved evidence.** Each passage with shared tags, cosine similarity and tag overlap.          |
| ![Explore the dev set](docs/showcase/05-explore-dev-set.png)<br>**Explore the dev set.** Headline figures with 95% CIs, filters and all 154 claims.                   | ![Gold vs retrieved evidence](docs/showcase/06-claim-evidence.png)<br>**Gold vs retrieved.** One claim's retrieved passages against the annotators' gold evidence.          |
| ![Results with intervals](docs/showcase/07-results-uncertainty.png)<br>**Results with intervals.** Wilson CIs for accuracy, bootstrap CIs for macro-F1 and retrieval. | ![Pipeline walkthrough](docs/showcase/08-pipeline-walkthrough.png)<br>**Pipeline walkthrough.** One claim followed through every stage, with real scores.                   |
| ![AI settings dialog](docs/showcase/09-byok-settings.png)<br>**Bring your own key.** Optional AI: your key stays in your browser, never on the server.                | ![LLM evaluation with a mocked run](docs/showcase/10-llm-eval-mocked.png)<br>**LLM evaluation (mocked run).** The paired harness, filled with a labelled mock: layout only. |
| ![Methods and decisions](docs/showcase/11-methods.png)<br>**Methods.** Provenance, evaluation design, limitations, AI use statement, decision records.                | ![Model card](docs/showcase/12-model-card.png)<br>**Model card.** Intended use, data, evaluation with intervals, known failure modes.                                       |
| <img src="docs/showcase/13-mobile-landing.png" width="260" alt="Phone: landing"><br>**Phone.** The landing page at 390 px.                                            | <img src="docs/showcase/14-mobile-try-verdict.png" width="260" alt="Phone: a verdict"><br>**Phone.** A verdict and its probabilities at 390 px.                             |

### Workflow walkthrough

Three recorded journeys, each a scripted run of the site with on-screen captions. The numbered
steps match the captions in each recording.

1. **Explore the dev set** ([GIF](docs/showcase/1-explore-dev-set.gif) · [video](https://comp90042-climate-fact-check.vercel.app/showcase/1-explore-dev-set.mp4))
   1. Open the 154 dev claims: the annotators' label, the model's verdict and the gold evidence it found.
   2. Filter to the 13 claims where the 2024 retrieval found at least one gold passage.
   3. Open dev claim 752 to compare gold and retrieved evidence side by side.
   4. Read the retrained Transformer's verdict three ways, with its class probabilities.
   5. Compare the retrieved passages (left) with the annotators' gold evidence (right).
   6. Switch between the submitted 2024 retrieval and the faithful re-runs, with P, R and F per run.
2. **Check a claim** ([GIF](docs/showcase/2-check-a-claim.gif) · [video](https://comp90042-climate-fact-check.vercel.app/showcase/2-check-a-claim.mp4))
   1. Type a claim: "Sea levels are rising faster than ever because glaciers are melting."
   2. Run the original pipeline: TF-IDF evidence retrieval, then the from-scratch Transformer.
   3. Read the verdict with all four class probabilities, beside the model's dev accuracy and its 95% CI.
   4. Inspect the retrieved passages, each with its cosine similarity and tag-overlap scores.
   5. Look under the hood: the notebook's preprocessing, the TF-IDF tag vector and each word's contribution.
   6. Pick a one-click example that was checked against the full 1.19M-passage search.
3. **Original model vs LLM** ([GIF](docs/showcase/3-model-vs-llm.gif) · [video](https://comp90042-climate-fact-check.vercel.app/showcase/3-model-vs-llm.mp4))
   1. Read the protocol: the same dev claims and the same evidence, scored as a paired comparison.
   2. Open the bring-your-own-key settings: provider, model, and where the key is kept.
   3. Cancel without entering a key.
   4. Load a saved run file: here a seeded **mock run, labelled "Mocked AI response for illustration"**. No model was called.
   5. Read accuracy and macro-F1 with 95% intervals, the paired difference and McNemar's exact test.
   6. Go claim by claim: each LLM verdict is labelled AI-generated beside the classifier's.

The LLM numbers in the third recording describe the mock, not any real model. With your own key,
[`/evaluation`](https://comp90042-climate-fact-check.vercel.app/evaluation) runs the same comparison for real.

The recordings and screenshots are reproducible: `web/e2e/showcase.spec.ts` drives Google Chrome
with Playwright through fixed inputs (one typed claim, dev claim 752, the harness's default sample
of 20 claims with seed 42, and a mock run drawn with seed 7). See
[Recording the showcase](#recording-the-showcase).

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

**What the 2026 upgrade adds:** the evaluation the project should have had in 2024, without
changing any original result.

- **Every number with its uncertainty.** Dev-set accuracy, macro-F1, retrieval precision,
  recall and F, and the course's harmonic mean, each with a 95% interval (Wilson for
  proportions, a percentile bootstrap over claims otherwise), paired comparisons with McNemar's
  test and Cohen's h, an error analysis by gold label, and a five-seed retrain of both models.
- **An LLM evaluation harness, bring your own key.** A large language model gets the same dev
  claims and the same retrieved passages as the 2024 classifier and must return a label and the
  ids of the passages it relied on. The page compares the two on the same claims, checks every
  cited id, and adds a gold-evidence upper bound.
- **Methods, model card, data statement and decision records**, rendered on the site under
  [`/methods`](https://comp90042-climate-fact-check.vercel.app/methods).

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

### The same results with their uncertainty

The 154 dev claims are a small sample, so every performance estimate on the site carries a 95% interval.
Proportions use the Wilson score interval; everything else uses a percentile bootstrap that
resamples whole claims (10,000 resamples, seed 2026). The point estimates are the original
values. `scripts/stats_reference.py` recomputes all of them with numpy, scikit-learn and
statsmodels, and the test suite requires the TypeScript and Python numbers to agree.

| Dev set, 154 claims                                | Estimate | 95% interval      |
| -------------------------------------------------- | -------: | ----------------- |
| Label accuracy, retrieved evidence                 |    38.3% | 31.0% to 46.2%    |
| Label accuracy, gold evidence                      |    57.8% | 49.9% to 65.3%    |
| Always answering "supports"                        |    44.2% | 36.6% to 52.0%    |
| Macro-F1, retrieved evidence                       |    0.215 | 0.172 to 0.256    |
| Evidence F-score (course metric)                   |    0.043 | 0.020 to 0.069    |
| Harmonic mean (course metric)                      |    0.077 | 0.039 to 0.117    |
| Classifier minus "always supports" (paired)        |  −5.8 pp | −14.3 to +2.6 pp  |
| Gold minus retrieved evidence, same model (paired) | +19.5 pp | +11.0 to +27.9 pp |

The classifier cannot be told apart from a constant answer (McNemar exact p = 0.22), while
better evidence would have helped it clearly (p < 0.001). Retrained under five seeds, none of
the ten Transformer and LSTM runs beats "always supports" on retrieved evidence, and none ever
predicts refuted or disputed. The [model card](docs/model-card.md) has the full table and the
recall for each label.

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

## LLM evaluation: bring your own key

The [`/evaluation`](https://comp90042-climate-fact-check.vercel.app/evaluation) page asks a
simple question honestly: would a modern LLM do better than the 2024 classifier with the same
evidence?

- **Same inputs.** A seeded random sample of dev claims (default N = 20, seed 42). For each
  claim the LLM receives the claim and the very passages the classifier read, each tagged with
  its id, and must return JSON: a label, the ids of the passages it relied on and a one-line
  rationale. The answer is validated with a schema.
- **Two conditions.** Retrieved evidence is the like-for-like test. Gold evidence is an upper
  bound: both systems with perfect retrieval.
- **Paired statistics.** Accuracy and macro-F1 with intervals for both systems, the paired
  difference with a bootstrap interval, McNemar's exact test, Cohen's h, citation validity
  (cited ids must be among the passages shown), the course's harmonic mean, latency and tokens.
  Macro-F1 averages both systems over one shared label set, and in evidence F a cited id the
  model was never shown counts as a wrong prediction. Calls that fail for infrastructure reasons
  are excluded and counted; unusable answers count as wrong. Runs export as JSON or CSV and can
  be loaded back; a loaded run's citation checks are recomputed and a hand-picked sample is
  flagged.
- **A caveat for the gold condition.** The classifier's gold-evidence verdicts come from the
  training epoch chosen on the same dev claims, so the gold condition flatters it.
- **Cost note.** The page estimates the cost before you run it. Twenty claims under both
  conditions are 40 calls, a few cents with Claude Haiku 4.5. Twenty claims also give accuracy
  intervals about 40 points wide, and the page says so next to every result.

**How the key is handled.** AI is optional: every page works without it. Open _AI settings_
(the key icon in the header), choose Anthropic (the default: `claude-haiku-4-5`, or
`claude-sonnet-5-5`) or OpenAI (`gpt-5-mini` by default, editable), and paste your own key. It is
kept in the tab's sessionStorage, or in localStorage only if you tick "remember on this
device", and "forget keys" deletes it. Requests go straight from your browser to the provider
(Anthropic with the `anthropic-dangerous-direct-browser-access` header). The key is never sent
to this site's server, never logged, never committed and never written to the audit log. The
site ships no LLM results, because it has no budget for model calls.

**The AI audit log.** Every call, including failed ones and calls you stop in flight, is
recorded in your browser (IndexedDB) with the prompt, the output, the model requested and the
model id the provider reported, latency, the token usage the provider reported, any retries
after a rate limit or overload, and your decision on the output (accepted, edited or rejected). View it at
[`/ai-log`](https://comp90042-climate-fact-check.vercel.app/ai-log) (also linked in the
footer and the mobile menu), export it as JSON or CSV, or clear it. Every AI output on the site
is labelled "AI-generated". A second-opinion panel on each claim page and Try-it result uses the
same client and the same log.

The design is informed by the Australian Government's policy for the responsible use of AI in
government, the EU AI Act's transparency principles and the NIST AI Risk Management Framework.
It makes no claim of compliance with any of them. The AI use statement is at
[`/methods#ai-use`](https://comp90042-climate-fact-check.vercel.app/methods#ai-use).

## Methods and decision records

[`/methods`](https://comp90042-climate-fact-check.vercel.app/methods) sets out data
provenance, the method, the evaluation design, assumptions, limitations, what I'd change and
the AI use statement. It renders these files from [`docs/`](docs/):

- [`docs/model-card.md`](docs/model-card.md): intended use, training data, evaluation with
  intervals, known failure modes and ethical considerations (`/methods/model-card`).
- [`docs/data-statement.md`](docs/data-statement.md): course data, label imbalance, the
  no-pretrained-weights rule, what is redistributed, and why this is not a fact-checking
  service (`/methods/data-statement`).
- [`docs/decisions/`](docs/decisions/): decision records, each stating the decision first, then
  the context, options, why, what happened (weak numbers included) and what I'd change.
  DR-001 TF-IDF retrieval over dense retrieval, DR-002 a from-scratch Transformer over an LSTM,
  DR-003 a pruned index for serverless hosting, DR-004 bring-your-own-key LLM features. A record
  is never edited after it is accepted; a new one supersedes it.

The site deploys `web/` only, so `pnpm sync:docs` copies these files into `web/content/`, and a
test fails if the copies drift from `docs/`.

## Tech stack

| Layer   | 2024 original                                      | 2026 revival                                                                            |
| ------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Runtime | Python 3.10 on Google Colab                        | Next.js 16 (App Router, Server Components), React 19, TypeScript (strict)               |
| NLP     | NLTK, contractions, scikit-learn `TfidfVectorizer` | Faithful TS ports in `web/src/lib` (Porter, Treebank tokenizer, TF-IDF, numpy argsort)  |
| Models  | PyTorch Transformer + LSTM                         | Retrained with the original code; Transformer exported as an exact token table          |
| Data    | pandas, pickles on Google Drive                    | Read-only SQLite (`better-sqlite3`), built by reproducible `uv` scripts                 |
| UI      | –                                                  | Tailwind CSS v4, shadcn/ui, Recharts, next-themes, lucide                               |
| Stats   | –                                                  | Wilson, bootstrap, McNemar and Cohen's h in `web/src/lib/stats`, checked against scipy  |
| AI      | –                                                  | Optional, bring your own key: browser-direct Anthropic/OpenAI calls, zod, IndexedDB log |
| Quality | –                                                  | vitest parity suite, ESLint, Prettier, GitHub Actions CI                                |

## Repository structure

```
.
├── README.md
├── LICENSE
├── .github/workflows/ci.yml     # lint, format, typecheck, test, build (web/)
├── docs/                        # model card, data statement, decision records (rendered at /methods)
│   └── showcase/                # README screenshots and walkthrough GIFs (pnpm showcase)
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
│   ├── build_web_data.py        # step 3: web/data/climate.db, TS data modules, fixtures
│   ├── seed_spread.py           # optional: retrain both models under five seeds
│   └── stats_reference.py       # reference statistics with numpy, scikit-learn, statsmodels
└── web/                         # the deployable Next.js app (Vercel root)
    ├── data/climate.db          # read-only SQLite artefact (13 MB), plus seed-spread.json
    ├── content/                 # copies of docs/ for the site (pnpm sync:docs)
    ├── e2e/                     # Playwright tour: recorded journeys + screenshots (pnpm showcase)
    ├── public/showcase/         # walkthrough MP4s, posters, caption tracks and screenshots for /tour
    └── src/
        ├── app/                 # /, /try, /explore, /explore/[claimId], /results, /method, /api/check,
        │                        # /evaluation, /methods (+ model card, data statement, decisions),
        │                        # /ai-log, /api/dev-set, /tour
        ├── components/          # ui/ (shadcn), layout/, common/, evidence/, explore/, try/, charts/,
        │                        # ai/, ai-log/, evaluation/, tour/
        ├── lib/                 # framework-free ports + vitest parity tests + fixtures
        │   ├── stats/           # intervals, bootstrap, McNemar, classification metrics
        │   ├── ai/              # provider adapters, settings, fact-check prompt, audit log
        │   └── evaluation/      # baseline report, LLM harness scoring, seed spread
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
static or read from `web/data/climate.db` on the server. The optional AI features use a key
that a visitor pastes into their own browser; nothing on the server ever holds one. Deploy with
`web/` as the Vercel root directory.

After editing anything under `docs/`, run `pnpm sync:docs` in `web/` so the site's copies match.

### Recording the showcase

`web/e2e/showcase.spec.ts` is a Playwright script that doubles as an end-to-end test of the three
main journeys. It uses your installed Google Chrome (`channel: "chrome"`), so no browser is
downloaded.

```bash
cd web
pnpm e2e                                     # the journeys as quick end-to-end tests (production)
pnpm showcase                                # paced recordings + screenshots, then the media script
pnpm build && BASE_URL=http://localhost:3309 pnpm showcase   # the same against a local build
```

`pnpm showcase` writes raw output to `web/.showcase/` (ignored by git), then
`scripts/showcase-media.mjs` uses ffmpeg and cwebp to write the optimised screenshots and GIFs to
`docs/showcase/`, and the MP4s, posters, caption tracks and WebP screenshots to
`web/public/showcase/`. Captions, step lists and transcripts all come from `web/src/lib/tour.ts`.
Video capture needs Playwright's ffmpeg build (`pnpm exec playwright install ffmpeg`, which is not
a browser). No API key is used: the LLM results are a seeded mock run loaded from a file and are
labelled as such in every caption.

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
uv run scripts/seed_spread.py          # optional, ~7 min per seed: web/data/seed-spread.json
uv run scripts/stats_reference.py      # ~1 min: Python reference values for the stats tests
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
