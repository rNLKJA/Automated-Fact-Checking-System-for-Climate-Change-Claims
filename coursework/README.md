# Original 2024 submission

This folder holds the group's COMP90042 (Natural Language Processing, University of
Melbourne, 2024 Semester 1) project as it was submitted. It is kept for reference
and academic integrity. The files were only **moved** here with `git mv`, so their
history is preserved and their contents are unchanged. The one exception is the
June 2026 black/isort formatting pass, which is recorded separately in the git log.

| Path                                     | What it is                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `COMP90042_Wed5PM_Group1.ipynb`          | The submitted notebook: preprocessing, TF-IDF retrieval, Transformer and LSTM, evaluation.    |
| `notebooks/COMP90042_Wed5PM_Group1.ipynb` | An identical copy of the notebook.                                                            |
| `COMP90042_Wed5PM_Group1.pdf`            | The team's six-page ACL-style report.                                                         |
| `scripts/eval.py`                        | The course's official evaluation script (evidence F, accuracy, harmonic mean).                |
| `scripts/data_downloader.py`             | The team's downloader for the claim files and the evidence corpus.                            |
| `data/README.md`                         | Notes on the datasets (they are downloaded, not committed).                                   |
| `requirements.txt`                       | The pinned Python environment from 2024.                                                      |
| `pyproject.toml`                         | black/isort settings from the 2026 formatting pass.                                           |
| `_archive/README.original.md`            | The repository README as it was in 2024.                                                      |

## Running it

The notebook was written for Google Colab (Python 3.10). Run it from this folder, so
that its relative `data/` paths resolve to `coursework/data/`:

```bash
cd coursework
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
jupyter lab COMP90042_Wed5PM_Group1.ipynb
```

The notebook downloads the course claim files from the public
[COMP90042_2024](https://github.com/drcarenhan/COMP90042_2024) repository and the
evidence corpus from the course Google Drive link. The team's intermediate artefacts
(TF-IDF vectorizers, `processed_evidence.csv`, `evidence_tfidf.pkl`) came from personal
Google Drive links, which may no longer be shared. If they are gone, the repository-level
`scripts/fetch_data.py` can verify a local copy and link it into `.cache/data/`. Symlink
those files into `coursework/data/` to run the notebook offline.

To score a predictions file with the course script:

```bash
python scripts/eval.py --predictions final_predictions.json --groundtruth data/dev-claims.json
```

The revived web app (`../web`) and its reproducible build scripts (`../scripts`) re-run
this code. See the root [README](../README.md) for how the two relate.
