# DR-002: A from-scratch Transformer encoder instead of an LSTM

**Decision:** Classify each claim with a Transformer encoder trained from scratch on the claim and evidence stems, chosen over a four-layer LSTM by validation accuracy.

| Status                         | Decided                            | Recorded                     | Owner                                       |
| ------------------------------ | ---------------------------------- | ---------------------------- | ------------------------------------------- |
| Accepted, with known flaws     | Semester 1, 2024 (COMP90042 group project) | 6 October 2026, in hindsight | Wei Zhao (model), recorded by Rin Huang     |

## Context

The classifier reads a claim together with its retrieved evidence and predicts one of four labels: supports, refutes, not enough info or disputed. Pretrained models were not allowed, so the network had to be trained from scratch on 1,228 claims. The labels are imbalanced. In the training set 42% of claims are labelled supports and 10% disputed.

Both candidate models used the same inputs: the claim's stems followed by the stems of its evidence, cut or padded to 128 tokens, with a vocabulary of 5,886 words built from the training claims and their gold evidence. Both were trained for ten epochs with Adam (learning rate 1e-4) and batch size 16. The validation set was the dev set with gold evidence.

## Decision

Use a six-layer Transformer encoder (256 dimensions, 8 heads, about 4.7M parameters) with mean pooling and a linear head. The report gives its validation accuracy as 57.14% against 46.75% for the LSTM.

## Options considered

| Option                                        | Notes                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Four-layer LSTM                               | Trained and compared in the notebook.                                                                                          |
| Six-layer Transformer encoder (chosen)        | Expected to capture claim-evidence relationships through self-attention.                                                      |
| TF-IDF features with logistic regression      | Not tried. It would have been a strong, cheap baseline for 1,228 claims.                                                       |
| Class weighting or resampling for imbalance   | Discussed in the report's future work, not applied.                                                                             |

## Why

The report reasoned that self-attention would capture long-range relationships between the claim and its evidence, and the validation numbers in the report favoured the Transformer by about ten points.

## What happened

Re-running the notebook in 2026 showed that the comparison and the model were both weaker than they looked.

- **The comparison does not hold up in the notebook's own log.** The report's 46.75% for the LSTM matches its validation accuracy at epochs 4 and 5, not at the end of training. At the final epoch the LSTM reached 58.4% (Wilson interval 50.5% to 65.9%) and the Transformer 57.1% (49.2% to 64.7%). At their best epochs the Transformer led by two points, 60.4% against 58.4%. That is three claims out of 154, well inside the noise. The 2026 retrain puts both models at the same best accuracy, 57.8%.
- **One training run cannot settle the choice.** Retraining both models under five seeds (42, 1, 2, 3 and 4) puts the Transformer's best validation accuracy between 57.8% and 59.1% and the LSTM's between 55.8% and 61.0%. The Transformer comes out ahead on three seeds, the LSTM on one, and they tie on one. The average gap is 0.9 points.
- **Model selection used the evaluation data.** The best epoch was chosen by accuracy on the dev set, and the dev set was then used to report results, so the reported figures are optimistic.
- **The Transformer never attended across words.** The encoder was built without `batch_first=True` but given `(batch, sequence)` tensors, so attention mixed the 16 claims of a mini-batch instead of the words of a claim. On a single claim the network reduces exactly to a bias plus the mean of per-token scores. The web app runs it that way and matches PyTorch to 7.7e-7.
- **It does no better than always answering "supports".** On retrieved evidence the retrained model is right on 38.3% of dev claims (Wilson interval 31.0% to 46.2%). Always answering supports scores 44.2%. The paired difference is −5.8 points (bootstrap interval −14.3 to +2.6) and McNemar's exact test gives p = 0.22, so the data cannot tell the two apart. The model's macro-F1 is higher (0.215 against 0.153) only because it sometimes gets not-enough-info right. Across the five seeds the Transformer scores 37.0% to 42.9% on retrieved evidence and the LSTM 35.7% to 40.3%. All ten runs fall below the 44.2% baseline.
- **Two labels are never predicted.** The model only ever answers supports or not enough info, and so does every one of the ten seed retrains. Recall for refuted (27 claims) and disputed (18 claims) is zero.

## What I'd change

- Fit a TF-IDF and logistic regression baseline first, and only keep a neural model that beats it on a paired test.
- Compare candidate models on the same claims with McNemar's test, over several training seeds, and report intervals instead of single accuracy figures from one training run.
- Hold out part of the training claims for model selection and touch the dev set once.
- Add class weights or balanced sampling, and report macro-F1 alongside accuracy so a model that ignores two classes cannot look acceptable.
- Add a unit test on tensor shapes. A one-line check that attention runs over the sequence axis would have caught the `batch_first` bug in 2024.
