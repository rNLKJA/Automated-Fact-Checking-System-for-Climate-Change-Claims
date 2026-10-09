# Model card: Climate Claim Checker (2024 pipeline, retrained 2026)

This card describes the system the site runs: the 2024 team's TF-IDF evidence retrieval rule and their from-scratch Transformer classifier, retrained in 2026 with the original code because the 2024 weights were never saved. It follows the structure of Mitchell et al. (2019), "Model Cards for Model Reporting". The optional LLM features are described at the end. They are not a model we trained.

## Model details

| Item         | Value                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developers   | Sunchuangyu (Rin) Huang, Wei Zhao and Xuan Wang (COMP90042, The University of Melbourne, Semester 1 2024). Retrained and documented by Rin Huang in 2026. |
| Retrieval    | Keyword tags per passage (top ten terms of a 20,000-feature TF-IDF model), a 1,000-term TF-IDF model for cosine similarity, tag overlap and thresholds. |
| Classifier   | Transformer encoder, 6 layers, 8 heads, 256 dimensions, feed-forward 512, dropout 0.1, mean pooling and a linear head. 4,670,468 parameters.            |
| Input        | Claim stems followed by evidence stems, wrapped in `[CLS]` and `[SEP]`, cut or padded to 128 tokens. Vocabulary of 5,886 words.                         |
| Training     | 10 epochs, Adam (learning rate 1e-4), batch size 16, no shuffling, cross-entropy loss, seed 42, PyTorch 2.3.0 on CPU. Best epoch by dev accuracy.        |
| Output       | One of SUPPORTS, REFUTES, NOT_ENOUGH_INFO or DISPUTED, with class probabilities.                                                                         |
| How it runs  | Exactly, as a 5,886 × 4 token table (see "Known failure modes"). It matches PyTorch to within 7.7e-7.                                                   |
| Licence      | Code under MIT. Data belongs to the subject and is not redistributed beyond the derived artefacts the site needs.                                        |

## Intended use

- Teaching and portfolio use: showing how a 2024 student fact-checking system works, step by step, and how well it does.
- Studying evaluation: the site reports every performance estimate with an interval and compares systems on the same claims.

## Out-of-scope uses

- Fact-checking real claims. The system is wrong more often than it is right, never says a claim is refuted, and its evidence comes from a fixed 2024 Wikipedia snapshot.
- Any decision about people, policy or content moderation.
- Any language other than English, or any topic other than climate science.

## Training data

1,228 labelled claims from the subject's public COMP90042_2024 repository, each with annotator-chosen gold evidence from a corpus of 1,208,827 Wikipedia sentences. The labels are imbalanced: 519 supports (42%), 386 not enough info (31%), 199 refutes (16%) and 124 disputed (10%). No pretrained weights or embeddings were used, as the subject required. See the [data statement](data-statement.md).

## Evaluation data

The 154 dev claims: 68 supports, 41 not enough info, 27 refutes and 18 disputed. The test set's labels were never released, so the only test-set figure is the course leaderboard result in the 2024 report (F 0.0331, accuracy 0.4079, harmonic mean 0.0612). The dev set was also used to choose the best training epoch, so the dev results below are optimistic.

## Evaluation

All intervals are 95%. Proportions use the Wilson score interval. Other quantities use a percentile bootstrap over claims (10,000 resamples, seed 2026). Point estimates are the original values.

| Measure (154 dev claims)                                   | Estimate | 95% interval     |
| ---------------------------------------------------------- | -------: | ---------------- |
| Label accuracy, retrieved evidence (notebook protocol)     |    38.3% | 31.0% to 46.2%   |
| Label accuracy, retrieved evidence (one claim at a time)   |    37.7% | 30.4% to 45.5%   |
| Label accuracy, gold evidence                              |    57.8% | 49.9% to 65.3%   |
| Always answering "supports"                                |    44.2% | 36.6% to 52.0%   |
| Macro-F1, retrieved evidence                               |    0.215 | 0.172 to 0.256   |
| Macro-F1, gold evidence                                    |    0.344 | 0.305 to 0.378   |
| Evidence F-score (course metric)                           |    0.043 | 0.020 to 0.069   |
| Evidence precision                                         |    0.065 | 0.030 to 0.105   |
| Evidence recall                                            |    0.042 | 0.019 to 0.069   |
| Claims with any gold passage retrieved                     |     8.4% | 5.0% to 13.9%    |
| Harmonic mean of F and accuracy (course metric)            |    0.077 | 0.039 to 0.117   |

Paired comparisons on the same claims:

| Comparison                                        | Accuracy difference | 95% interval       | McNemar exact p | Cohen's h |
| ------------------------------------------------- | ------------------: | ------------------ | --------------: | --------: |
| Classifier vs always "supports"                   |            −5.8 pp | −14.3 to +2.6 pp   |            0.22 |     −0.12 |
| Gold evidence vs retrieved evidence (classifier)  |           +19.5 pp | +11.0 to +27.9 pp  |         < 0.001 |      0.39 |

Recall by gold label (retrieved evidence): supports 61.8% (49.9% to 72.4%), not enough info 41.5% (27.8% to 56.6%), refutes 0% (0% to 12.5%), disputed 0% (0% to 17.6%).

Training-seed spread. The site's model is one training run (seed 42). Retrained with the same code under seeds 42, 1, 2, 3 and 4, the Transformer scores between 37.0% and 42.9% on retrieved evidence (mean 39.1%, SD 2.2 points) and between 57.8% and 59.1% with gold evidence. None of the five runs beats always answering "supports", and none ever predicts refuted or disputed. The seed-42 retrain reproduces the stored predictions for all 154 claims.

## Known failure modes

- **It never predicts refuted or disputed.** Every verdict is supports or not enough info, whatever the evidence.
- **It is no better than a constant answer on accuracy.** The interval for the difference from always answering "supports" includes zero.
- **Its attention never looks across words.** The encoder was built without `batch_first=True`, so during training attention mixed the claims of a mini-batch. On one claim the network is exactly a bias plus the average of per-token scores, a bag-of-words model. Word order and negation are invisible to it.
- **Batch neighbours change its answers.** In the notebook's protocol, dev claims are predicted 16 at a time, so a claim's verdict can depend on the claims next to it in the file. One claim at a time it scores 37.7% instead of 38.3%.
- **It depends on retrieval it cannot correct.** A gold passage is retrieved for 8.4% of claims. With gold evidence the same model gains 19.5 points.
- **Long evidence is cut off.** Only the first 128 tokens are read, so later passages may be ignored entirely.
- **The tags carry an artefact.** numpy's unstable sort put one Arabic name into the tags of 167,592 passages, which adds noise to tag overlap.
- **Free text searches a subset.** The site searches 39,666 passages instead of 1.19M. For new sentences it matched the full search on 39 of 60 held-out claims (65%, 52% to 76%). Every result says whether it is verified.

## Ethical considerations

- A confident "supports" from a weak model can lend false authority to misinformation. The Try-it page calls the model a museum piece next to every verdict and shows its dev-set accuracy beside it.
- The labels reflect the dataset's annotators and Wikipedia's coverage in 2024. Neither is a ground truth about climate science.
- No personal data is used. Wikipedia sentences can mention public figures.
- The original coursework is kept unchanged for academic integrity, and current students of the subject should not reuse it.

## Optional LLM features (not a trained model)

Visitors can bring their own Anthropic or OpenAI key to ask an LLM for a second opinion on a claim, or to compare an LLM with this classifier on the same claims and evidence. The LLM is told to judge from the given passages only and to cite passage ids. Its outputs are labelled as AI-generated, validated against a schema, written to an audit log in the visitor's browser, and reviewed by the visitor (accept, edit or reject). The site ships no LLM results, because none have been run with a budget. See [DR-004](decisions/DR-004-byok-browser-only-llm-evaluation.md) and the [AI use statement](https://comp90042-climate-fact-check.vercel.app/methods#ai-use).

## Reproducibility

`scripts/train_classifier.py` retrains the model, `scripts/build_web_data.py` builds `web/data/climate.db`, and `scripts/stats_reference.py` recomputes every number on this card with numpy, scikit-learn and statsmodels. The web app's test suite checks that its own statistics match.
