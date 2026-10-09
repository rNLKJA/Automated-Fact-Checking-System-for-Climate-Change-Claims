# Data statement

This statement describes the data behind the Climate Claim Checker, following the headings of Bender and Friedman (2018), "Data Statements for Natural Language Processing". Where something is not known, it says so.

## Curation rationale

The data is the COMP90042 Natural Language Processing project dataset for Semester 1, 2024, published by the subject in its public [COMP90042_2024](https://github.com/drcarenhan/COMP90042_2024) repository. It was built for teaching automated fact-checking. A system retrieves evidence for a claim about climate science and labels the claim. The team did not collect or label any data.

## What it contains

| Part                    | Size                                     | Labels                                                      |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Training claims         | 1,228                                    | 519 supports, 386 not enough info, 199 refutes, 124 disputed |
| Development (dev) claims | 154                                      | 68 supports, 41 not enough info, 27 refutes, 18 disputed     |
| Test claims             | 153                                      | Never released                                              |
| Evidence corpus         | 1,208,827 passages (Wikipedia sentences) | None. Gold evidence ids are attached to each labelled claim. |

The four labels mean that the evidence supports the claim, refutes it, does not settle it, or contains both supporting and refuting passages.

## Label imbalance

Supports is the largest class in both labelled splits (42% of training claims, 44% of dev claims) and disputed the smallest (10% and 12%). A model can reach 44.2% dev accuracy by always answering supports, so every accuracy on this site is shown next to that baseline, and macro-F1 is reported to weigh the four labels equally.

## Language variety

English. The claims are short statements about climate science, some phrased the way they appear in public debate. The evidence is single sentences from English Wikipedia, mostly 11 to 50 words long. 13,578 passages have five words or fewer.

## Speakers and annotators

Not documented in the subject's materials as far as the team knew. The claims' original authors and the annotators who chose labels and gold evidence are unknown to us, as are their backgrounds. Wikipedia's editors are a known skewed population, and its coverage of climate topics reflects that.

## The no-pretraining constraint

The subject did not allow pretrained language models or embeddings. Every model in the 2024 system was trained from scratch on the 1,228 training claims and their evidence. The 2026 retrain kept that constraint. The optional LLM features added in 2026 sit outside it on purpose, to measure what the constraint cost, and they are labelled as such.

## What the site redistributes

- The text of the 154 dev claims, their labels and gold evidence ids, which the Explore pages display.
- For train and test claims, only ids, labels (train) and stemmed tags. Their text is not redistributed.
- 39,666 of the 1,208,827 evidence passages, with the team's derived tags and TF-IDF rows. The full corpus is not redistributed.
- The assignment specification is paraphrased, never reproduced.

## Not a fact-checking service

This dataset and the system trained on it are for teaching and study. The labels describe the relationship between a claim and a fixed set of 2024 Wikipedia sentences, not the current state of climate science. Nothing on the site should be used to decide whether a real claim is true.
