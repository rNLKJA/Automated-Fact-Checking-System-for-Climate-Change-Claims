# Build scripts

These scripts re-run the **original** 2024 code to produce the web app's data. Each one
is a self-contained [uv](https://docs.astral.sh/uv/) script (PEP 723 inline
dependencies, pinned to the 2024 library versions), so no virtualenv setup is needed.
Run them from the repository root, in order:

| Step | Command                                                  | Takes      | Output                                                                              |
| ---- | -------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| 0    | `uv run scripts/fetch_data.py [--from DIR] [--download]` | seconds    | verifies or links every input into `.cache/data/` (MD5-pinned)                      |
| 1    | `uv run scripts/build_retrieval.py`                      | ~6 min     | `.cache/build/retrieval.json`: retrieval over all 1.19M passages, parity, sweeps    |
| 2    | `uv run scripts/train_classifier.py`                     | ~7 min CPU | `.cache/build/classifier.json` + `.cache/models/*.bin` (retrained Transformer/LSTM) |
| 3    | `uv run scripts/build_web_data.py`                       | ~1 min     | `web/data/climate.db`, generated TS data modules, test fixtures                     |

`original.py` holds the notebook's functions verbatim (preprocessing, keyword
extraction, `find_top_evidence`) and is imported by the other scripts.
`free_text_claims.py` lists the Try-it page's examples (their full-corpus selections are
added to the pruned index, and each example's note is checked against them) and 60
held-out claims that measure how often the pruned index agrees with the full corpus on
new text. Nothing under
`.cache/` is committed: it holds the 174 MB course corpus, the team's artefacts and the
retrained checkpoints. Step 3 is deterministic. Re-running it on the same inputs
produces a byte-identical `climate.db`.

See the root README's _Data artefacts_ section for what each output contains and how the
results compare with the 2024 report.
