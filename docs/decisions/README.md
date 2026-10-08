# Decision records

Each record explains one decision that shaped this project, and every record follows the same order. It states the decision first and then gives the context. It sets out the decision in full, the options that were considered and why one was chosen. It reports what happened, weak numbers included, and ends with what I'd change.

Records are never edited after they are accepted. If a decision changes, a new record supersedes the old one and says so.

| Record                                                | Decision                                                                   | Decided  |
| ----------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| [DR-001](DR-001-tfidf-retrieval-over-dense-retrieval.md) | TF-IDF keyword retrieval instead of dense retrieval                        | 2024     |
| [DR-002](DR-002-from-scratch-transformer-over-lstm.md)   | A from-scratch Transformer encoder instead of an LSTM                      | 2024     |
| [DR-003](DR-003-pruned-index-for-serverless.md)          | A pruned, read-only evidence index for serverless hosting                  | Oct 2026 |
| [DR-004](DR-004-byok-browser-only-llm-evaluation.md)     | Bring-your-own-key LLM features, called from the browser, with a local log | Oct 2026 |

DR-001 and DR-002 were team decisions made in 2024 and recorded in 2026 with what the re-run revealed. The numbers in every record come from `web/data/climate.db` and are recomputed independently by `scripts/stats_reference.py`. The site renders these files at `/methods`.
