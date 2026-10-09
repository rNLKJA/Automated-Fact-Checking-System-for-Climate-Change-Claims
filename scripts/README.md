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

Two more scripts support the evaluation pages and change nothing above:

| Script                              | Takes         | Output                                                                                                                                |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `uv run scripts/seed_spread.py`     | ~7 min a seed | `web/data/seed-spread.json`: the notebook's Transformer and LSTM retrained under seeds 42, 1, 2, 3 and 4 (needs steps 0 to 2)         |
| `uv run scripts/stats_reference.py` | ~1 min        | `web/src/lib/__fixtures__/stats-reference.json`: scipy, statsmodels and scikit-learn reference values and the dev-set baseline report |

`stats_reference.py` reads only `web/data/climate.db`. It ports the site's mulberry32 random
number generator to Python, so the vitest suite can compare every bootstrap interval with numpy
to twelve decimal places. Re-running it on the same database rewrites the fixture unchanged.

See the root README's _Data artefacts_ section for what each output contains and how the
results compare with the 2024 report.
