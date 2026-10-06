# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "gdown>=5.1",
#   "requests>=2.31",
# ]
# ///
"""Step 0 - put every input of the build pipeline into ``.cache/data`` and verify it.

Nothing in here is committed: the course data (``evidence.json`` alone is 174 MB)
and the team's 2024 artefacts stay in the gitignored ``.cache/`` folder.

Sources, in the order they are tried for each missing file:

1. ``--from DIR``: a local copy (for example the team's Google Drive export).
   Files are found by name anywhere under DIR and *symlinked*, never copied.
2. ``--download``: the URLs the 2024 notebook itself used - the public course
   repository (claims) and the Google Drive IDs hard-coded in the notebook
   (evidence corpus + the team's intermediate artefacts). The personal Drive
   links may no longer be shared; the script says so instead of failing silently.

Every file is checked against the MD5 pinned below. The five course files use the
checksums printed in the notebook (cell 5); the team artefacts are pinned to the
copies that reproduce the reported 2024 numbers.

Usage:
  uv run scripts/fetch_data.py                       # verify only
  uv run scripts/fetch_data.py --from "/path/to/NLP Data" --from "/path/to/Group Project"
  uv run scripts/fetch_data.py --download
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("FCS_CACHE", ROOT / ".cache")) / "data"

COURSE_RAW = "https://raw.githubusercontent.com/drcarenhan/COMP90042_2024/main/data/"


@dataclass(frozen=True)
class Item:
    name: str  # file name inside .cache/data
    md5: str
    size: int
    role: str
    url: str | None = None  # direct URL or "gdrive:<id>"
    source_name: str | None = None  # file name in the original Drive folder, if different
    required: bool = True


ITEMS: list[Item] = [
    # --- course data (checksums from notebook cell 5) ---------------------------------
    Item("train-claims.json", "671a07d1545a2dc467e870bc1e76961c", 328040, "1,228 labelled training claims",
         COURSE_RAW + "train-claims.json"),
    Item("dev-claims.json", "0076e390272dacfb27341f9190985c5c", 41487, "154 labelled dev claims",
         COURSE_RAW + "dev-claims.json"),
    Item("dev-claims-baseline.json", "5ca47229487d6cf7faa964f94e77777c", 49648, "course baseline predictions",
         COURSE_RAW + "dev-claims-baseline.json", required=False),
    Item("test-claims-unlabelled.json", "8b5309187ac284963a5c6ec0ff467a3b", 24328, "153 unlabelled test claims",
         COURSE_RAW + "test-claims-unlabelled.json"),
    Item("evidence.json", "091fd62cccba1105fd8de5c38b541f91", 174202774, "1,208,827 evidence passages",
         "gdrive:1JlUzRufknsHzKzvrEjgw8D3n_IRpjzo6"),
    # --- team artefacts from 2024 (Drive IDs from the notebook) -------------------------
    Item("processed_evidence.csv", "75c439d3b7639ce0a374c25d7fc5470b", 219767866,
         "evidence + keyword tags (cells 18-19)", "gdrive:1AfwVBx7eS1EFta1Y0be1-PShlDLG43m7"),
    Item("evidence_tfidf.pkl", "4397d6536fd4d10d8196e89494624c46", 56916987,
         "tag TF-IDF matrix of the evidence (cell 21)", "gdrive:1SkC2OgnVFi9JJg5_ZcUaAmtLacLEzVWW"),
    Item("tfidf_tag_vectorizer.pkl", "d16928b1700ba58eca608d3c17627b80", 142275,
         "1,000-term tag vectorizer (cell 20)", "gdrive:1NiqmcdnkWIouOeyAkeguX6XOxBt7S2IM"),
    Item("tfidf_keyword_vectorizer.pkl", "1a40dbd027cfc3c2cb016698b965de9e", 301516306,
         "20,000-feature keyword vectorizer that produced the evidence tags (cell 14 parameters)",
         None, source_name="tfidf_vectorizer.pkl", required=False),
    Item("evidence_ret.json", "36e4f3e8c805e7ed177087b56029eb82", 34062,
         "the team's saved dev retrieval (reported F = 0.04299)"),
    Item("test-with-retrieved-evidences.json", "9a94703b1e4feefe120af4aadcff125b", 29254,
         "the team's saved test retrieval"),
    Item("preprocessed_test_claims.json", "3d44db57284ffa3d0afa6e93b19d3425", 41650,
         "test retrieval from the committed notebook (cell 31)", "gdrive:1-56hkNbSB_2Y44cO3MJzOT8dE6TOg3EQ",
         required=False),
]


def md5_of(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(item: Item) -> bool:
    path = DATA / item.name
    if not path.exists():
        return False
    if path.stat().st_size != item.size:  # cheap check first
        return False
    return md5_of(path) == item.md5


def link_from(item: Item, roots: list[Path]) -> bool:
    wanted = item.source_name or item.name
    for root in roots:
        for candidate in sorted(root.rglob(wanted)):
            if candidate.is_file() and candidate.stat().st_size == item.size and md5_of(candidate) == item.md5:
                target = DATA / item.name
                if target.is_symlink() or target.exists():
                    target.unlink()
                target.symlink_to(candidate.resolve())
                print(f"  linked {item.name} -> {candidate}")
                return True
    return False


def download(item: Item) -> bool:
    if not item.url:
        return False
    target = DATA / item.name
    try:
        if item.url.startswith("gdrive:"):
            import gdown

            out = gdown.download(id=item.url.removeprefix("gdrive:"), output=str(target), quiet=False)
            if out is None:
                return False
        else:
            import requests

            r = requests.get(item.url, timeout=120)
            r.raise_for_status()
            target.write_bytes(r.content)
    except Exception as exc:  # noqa: BLE001 - report and continue with the next file
        print(f"  download failed for {item.name}: {exc}")
        return False
    return verify(item)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="roots", action="append", type=Path, default=[],
                    help="directory holding a local copy of the files (repeatable)")
    ap.add_argument("--download", action="store_true", help="fetch missing files from their 2024 URLs")
    args = ap.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)

    missing_required = []
    for item in ITEMS:
        ok = verify(item)
        if not ok and args.roots:
            ok = link_from(item, args.roots)
        if not ok and args.download:
            ok = download(item)
        flag = "ok " if ok else ("-- " if not item.required else "!! ")
        print(f"{flag} {item.name:<36} {item.role}")
        if not ok and item.required:
            missing_required.append(item.name)

    if missing_required:
        print("\nMissing required inputs: " + ", ".join(missing_required))
        print("Pass --from DIR (a local copy) or --download. See README.md > 'Data artefacts'.")
        return 1
    print(f"\nAll required inputs verified in {DATA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
