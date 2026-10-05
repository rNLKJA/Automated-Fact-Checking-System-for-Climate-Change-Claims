"""Verbatim ports of the functions from the 2024 notebook.

Everything in this module is copied from
``coursework/COMP90042_Wed5PM_Group1.ipynb`` with only two kinds of change:

* imports are made explicit (the notebook relied on cell execution order), and
* helper loaders (``load_*``) wrap the notebook's ``pickle.load`` calls so the
  pickled ``TfidfVectorizer`` objects can find ``preprocess_and_tokenize``,
  which was defined in ``__main__`` when they were pickled in Colab.

Do NOT "fix" anything in here: the web app's TypeScript port is tested against
these exact semantics (including the known quirks documented in the README).
"""

from __future__ import annotations

import json
import os
import pickle
import string
import sys
from pathlib import Path

import contractions
import nltk
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get("FCS_CACHE", ROOT / ".cache"))
DATA = CACHE / "data"
NLTK_DIR = CACHE / "nltk_data"
NLTK_DIR.mkdir(parents=True, exist_ok=True)
nltk.data.path.insert(0, str(NLTK_DIR))
for pkg, probe in (("punkt", "tokenizers/punkt"), ("stopwords", "corpora/stopwords")):
    try:
        nltk.data.find(probe)
    except LookupError:
        nltk.download(pkg, quiet=True, download_dir=str(NLTK_DIR))

from nltk.corpus import stopwords  # noqa: E402
from nltk.stem import PorterStemmer  # noqa: E402
from nltk.tokenize import word_tokenize  # noqa: E402

base_stopwords = set(stopwords.words("english"))
stemmer = PorterStemmer()

LABEL_MAPPING = {"SUPPORTS": 0, "REFUTES": 1, "NOT_ENOUGH_INFO": 2, "DISPUTED": 3}
REVERSE_LABEL_MAPPING = {v: k for k, v in LABEL_MAPPING.items()}


# --- cell 9 -----------------------------------------------------------------
def preprocess_and_tokenize(text):
    try:
        # Expand contractions
        text = contractions.fix(text)
    except IndexError:
        # Handle cases where contractions.fix fails
        print(f"Error expanding contractions in text: {text}")

    # Convert text to lowercase
    text = text.lower()

    # Handle concatenated words with punctuation (e.g., "sentence.abc" -> "sentence abc")
    for char in string.punctuation:
        text = text.replace(char, " " + char + " ")

    # Remove punctuation
    text = text.translate(str.maketrans("", "", string.punctuation))

    # Tokenize text
    tokens = word_tokenize(text)

    # Remove stopwords and stem tokens
    filtered_tokens = [
        stemmer.stem(word)
        for word in tokens
        if word not in base_stopwords and word.isalpha()
    ]

    return filtered_tokens


# The vectorizers were pickled from a notebook, so pickle looks the tokenizer up
# on ``__main__``. Expose it there before any unpickling happens.
setattr(sys.modules["__main__"], "preprocess_and_tokenize", preprocess_and_tokenize)


# --- cell 16 ----------------------------------------------------------------
def extract_most_relevant_keywords_for_a_claim(claim, tfidf_vectorizer, top_n=10):
    # Preprocess and tokenize the claim
    preprocessed_claim = preprocess_and_tokenize(claim)

    # Transform the preprocessed claim to a TF-IDF vector
    tfidf_vector = tfidf_vectorizer.transform([" ".join(preprocessed_claim)])

    # Convert the vector to an array for easier manipulation
    row_array = tfidf_vector.toarray()[0]

    # Get the indices of the top_n values
    top_n_idx = np.argsort(row_array)[-top_n:][::-1]

    # Get the corresponding feature names (keywords) for these indices
    feature_names = tfidf_vectorizer.get_feature_names_out()
    top_keywords = [feature_names[i] for i in top_n_idx if feature_names[i].isalpha()]

    return " ".join(set(top_keywords))


# --- cell 24 ----------------------------------------------------------------
def compute_overlap_rate(claim_tags, evidence_tags):
    claim_words = set(claim_tags.split())
    evidence_words = set(evidence_tags.split())
    overlap = len(claim_words.intersection(evidence_words))
    return overlap / min(len(claim_words), len(evidence_words))


def find_max_overlap_word_count(claim_tags, evidence_tags):
    claim_words = set(claim_tags.split())
    evidence_words = set(evidence_tags.split())
    overlap = len(claim_words.intersection(evidence_words))
    return overlap


def find_top_evidence(claim_tags, evidence_tfidf, vectorizer, evidence_df, top_n=6):
    # Transform the claim tags into a TF-IDF vector
    claim_tfidf = vectorizer.transform([claim_tags])

    # Calculate cosine similarity within the selected cluster
    relevant_tfidf = evidence_tfidf
    similarities = cosine_similarity(claim_tfidf, relevant_tfidf).flatten()

    # Calculate overlap rate for each evidence in the relevant cluster
    overlap_rates = evidence_df["evidence_tags"].apply(
        lambda evidence_tags: compute_overlap_rate(claim_tags, evidence_tags)
    )
    similarities_between_claim_and_evidence = cosine_similarity(
        claim_tfidf, evidence_tfidf
    ).flatten()

    # Combine overlap rate and cosine similarity into a single score
    combined_scores = (
        similarities + overlap_rates + similarities_between_claim_and_evidence
    )

    # Assign combined scores back to the relevant evidence DataFrame
    evidence_df["similaritie"] = similarities
    evidence_df["overlap_rate"] = overlap_rates
    evidence_df["combined_score"] = combined_scores
    evidence_df["max_match"] = evidence_df["evidence_tags"].apply(
        lambda evidence_tags: find_max_overlap_word_count(claim_tags, evidence_tags)
    )

    # Filter and sort evidence
    filtered_evidence = evidence_df.query(
        "similaritie > 0.55 and overlap_rate > 0.5 and combined_score > 1.5"
    )
    if filtered_evidence.empty:
        # (original printed a warning here)
        relevant_evidence = evidence_df.sort_values(
            by="combined_score", ascending=False
        ).head(top_n)
    else:
        relevant_evidence = filtered_evidence.sort_values(
            by=["overlap_rate", "similaritie"], ascending=[False, False]
        )
        relevant_evidence = relevant_evidence.sort_values(
            by="combined_score", ascending=False
        )

        # Check if relevant_evidence is empty before calling max
        if relevant_evidence.empty:
            relevant_evidence = evidence_df.sort_values(
                by="combined_score", ascending=False
            ).head(top_n)
        else:
            max_match_value = max(relevant_evidence["max_match"])
            relevant_evidence = relevant_evidence[
                relevant_evidence.max_match == max_match_value
            ].head(top_n)

    return list(relevant_evidence["evidence_id"])


# --- loaders ----------------------------------------------------------------
def load_pickle(name: str):
    with open(DATA / name, "rb") as f:
        return pickle.load(f)


def load_claims(name: str) -> dict:
    with open(DATA / name) as f:
        return json.load(f)


def load_evidence() -> dict:
    with open(DATA / "evidence.json") as f:
        return json.load(f)


def load_processed_evidence() -> pd.DataFrame:
    """cell 23: ``pd.read_csv('data/processed_evidence.csv').dropna(subset=['evidence_tags'])``"""
    return pd.read_csv(DATA / "processed_evidence.csv").dropna(subset=["evidence_tags"])
