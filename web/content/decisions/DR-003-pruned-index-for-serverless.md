# DR-003: A pruned, read-only evidence index for serverless hosting

**Decision:** Ship a 39,666-passage subset of the evidence corpus in a 13 MB read-only SQLite file with the web app, prove that it reproduces the full-corpus retrieval for every dataset claim, and label every free-text result with whether it is verified.

| Status   | Decided                        | Recorded       | Owner                   |
| -------- | ------------------------------ | -------------- | ----------------------- |
| Accepted | October 2026 (the web revival) | 6 October 2026 | Sunchuangyu (Rin) Huang |

## Context

The 2026 revival lets anyone type a claim and run the original retrieval rule and classifier. The original artefacts are large. The corpus file alone is 174 MB, the passage-by-term TF-IDF matrix is 57 MB, and the keyword vectoriser is 302 MB. The site runs on Vercel serverless functions, which cap a function's unzipped size at 250 MB and start cold, and the project has no budget for a database server or a search service.

## Decision

Build a pruned index with `scripts/build_web_data.py`. It holds every gold passage for the train and dev claims (3,443), every passage either retrieval rule could select for any train, dev or test claim (12,350), every passage it could select for the Try-it examples (129), and a seeded random sample of 25,000 passages (seed 2024). The sets overlap, giving 39,666 passages. Each keeps its text, the team's tags and its exact row of the team's TF-IDF matrix. The file is opened read-only, and the TypeScript port scores all of it in a few milliseconds per claim.

## Options considered

| Option                                              | Trade-off                                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Full corpus bundled with the function               | Exact for any text, but well over the 250 MB limit and slow to cold-start.                                                        |
| Full corpus in a hosted database (Postgres, Turso)  | Exact, but a running cost and a network hop per query, for a portfolio demo with no budget.                                       |
| Precomputed results only, no free text              | Cheapest and exact, but visitors could not try their own claims.                                                                  |
| Pruned index with verification labels (chosen)      | Free, fast and exact for every dataset claim. Free text may select different passages than the full 2024 search would.           |

## Why

Exactness matters most where the site makes claims about the 2024 system, and those claims are about the dataset. The pruned index is exact there, and a test checks it. For free text the site can be honest instead of exact: every Try-it result says whether its selection was verified against the full corpus or came from the subset.

## What happened

- For every dev and test claim, and for the Try-it examples, the pruned index returns the same passages as the full 1.19M-passage search, up to exact score ties. vitest re-checks this on every run.
- On 60 hand-written climate claims that played no part in building the index, it picked the same passages as the full search for 39 (65%, Wilson interval 52% to 76%). On the filtered path it agreed on 35 of 52, but on the fallback path on only 4 of 8, because the six best-scoring passages out of 1.19M are rarely in the subset.
- The database is 13 MB and needs no environment variables. Apart from the Try-it API route, every page is rendered once at build time.

## What I'd change

- Grow the held-out set beyond 60 claims. The agreement rate's interval is 24 points wide.
- Try an inverted index over the tags of the full corpus, compressed. Because the rule only needs passages that share at least one tag with the claim, it might fit the size limit and remove the subset caveat entirely.
- Publish the free-text agreement rate with its interval on the Try-it page itself, not only the raw count.
