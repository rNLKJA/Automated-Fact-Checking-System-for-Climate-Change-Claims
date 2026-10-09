# DR-001: TF-IDF keyword retrieval instead of dense retrieval

**Decision:** Retrieve evidence by matching a claim's stemmed words against TF-IDF keyword tags on every passage, scored by cosine similarity plus tag overlap, and do not attempt dense (embedding) retrieval.

| Status   | Decided                            | Recorded                     | Owner                   |
| -------- | ---------------------------------- | ---------------------------- | ----------------------- |
| Accepted | Semester 1, 2024 (COMP90042 group project) | 6 October 2026, in hindsight | Sunchuangyu (Rin) Huang |

## Context

The task gave us 1,228 labelled training claims and a knowledge source of 1,208,827 Wikipedia sentences. For each claim the system had to return a handful of evidence passages, and it was scored on evidence F-score against the annotators' passages as well as on label accuracy.

The subject did not allow pretrained language models or pretrained embeddings. Everything had to be learned from the course data. We worked in Google Colab, so the whole corpus had to be processed within a free notebook's memory and time limits.

## Decision

Each passage was tagged once, offline, with its ten highest-weighted terms under a 20,000-feature TF-IDF model. At query time a claim's tags are its sorted Porter stems. A second, 1,000-term TF-IDF model turns both sets of tags into vectors. A passage is kept when the cosine similarity is above 0.55 and the share of shared tags is above 0.5. The kept passages are sorted by the combined score, and only those sharing the most tags with the claim survive, up to six. If nothing passes the thresholds, the six best-scoring passages are returned instead.

## Options considered

| Option                                                   | Why it was not chosen in 2024                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dense retrieval with a bi-encoder trained from scratch   | 1,228 claims are far too few to learn useful sentence embeddings without pretraining, and encoding 1.2M passages on Colab was not realistic for us.                   |
| BM25 over the full passage text                          | A reasonable non-neural baseline. We did not try it.                                                                                                                   |
| TF-IDF cosine over the full passage text                 | The report notes that the 13,578 passages of five words or fewer are easy to match spuriously on cosine similarity.                                                   |
| Keyword tags + TF-IDF + overlap thresholds (chosen)      | Cheap to compute once, fast to query, and easy to explain claim by claim.                                                                                               |

## Why

The rule respected the course constraint, fitted the compute we had, and every retrieved passage could be explained by the tags it shared with the claim. That transparency is still what makes the 2026 web app able to show why each passage was picked.

## What happened

Retrieval was the weakest part of the system, and the numbers are weak.

- The mean evidence F-score on the 154 dev claims was 0.043, with a 95% bootstrap interval of 0.020 to 0.069. On the hidden test set the course leaderboard gave 0.033.
- A gold passage was retrieved for only 13 of 154 dev claims (8.4%, Wilson interval 5.0% to 13.9%).
- For 47% of dev claims no passage passed the thresholds, so the fallback path returned six passages that shared words with the claim but rarely its meaning.
- Retrieval was worst for refuted claims. A gold passage was found for 1 of 27, and the mean evidence F was 0.015.
- The tags carried noise we did not see in 2024. numpy's unstable sort padded short passages' top-ten keywords with zero-weight features, so the last vocabulary entry, an Arabic name, sits in 167,592 passages' tags.
- The same classifier gains 19.5 percentage points of accuracy (paired bootstrap interval 11.0 to 27.9, McNemar exact p < 0.001) when it reads the gold passages instead of the retrieved ones. Retrieval held the whole system back.

## What I'd change

- Start with BM25 over the full passage text as a baseline. It needs no pretraining and would have told us early whether keyword tags were losing information.
- Measure retrieval on its own (recall at k against the gold passages) before building the classifier on top of it.
- Choose the thresholds on part of the training claims and keep the dev set for the final evaluation only. The threshold sweeps on the results page show how much F moves with them.
- Report every retrieval number with an interval. With 154 claims, a single figure such as 0.043 hides how uncertain it is.
