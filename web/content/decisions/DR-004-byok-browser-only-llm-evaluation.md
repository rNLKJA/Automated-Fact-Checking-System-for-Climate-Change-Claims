# DR-004: Bring-your-own-key LLM features, called from the browser, with a local audit log

**Decision:** Offer LLM features (a second opinion on a claim and a paired LLM-versus-classifier evaluation) only through the visitor's own API key, called directly from their browser, with every call written to an audit log kept in that browser.

| Status   | Decided        | Recorded       | Owner                   |
| -------- | -------------- | -------------- | ----------------------- |
| Accepted | 6 October 2026 | 6 October 2026 | Sunchuangyu (Rin) Huang |

## Context

I wanted the site to answer an obvious question: would a modern large language model do better than the 2024 classifier on the same claims and the same evidence? There is no budget for model calls, and the site must work fully without any AI. It is a public site, so a key held by the site could be abused, and visitors should not have to trust this site with their key. The site's own data is read-only, so there is nowhere on the server to keep an audit trail.

## Decision

- A visitor can paste their own Anthropic or OpenAI key in an "AI settings" dialog. It is kept in sessionStorage unless they tick "remember on this device", and a "forget keys" button removes it.
- Requests go straight from the browser to the provider. Anthropic calls use the `anthropic-dangerous-direct-browser-access` header. The key is never sent to this site's server, never logged and never stored in the audit log, and a test checks that it is scrubbed from every record.
- The default model is Claude Haiku 4.5 at temperature 0, with Claude Sonnet 5.5 (low effort) as an option. The OpenAI model id is editable.
- The model must answer in a fixed JSON shape, validated with zod. Cited evidence ids are free text on purpose, so that citing a passage it was never shown is possible and can be measured.
- Server-side model fallbacks are not enabled. An evaluation must know which model produced each answer, so a refused request is recorded as a refusal instead of being re-run on another model.
- Every call, including failures, is appended to an IndexedDB log with the prompt, the output, latency, token usage and the human decision (accepted, edited or rejected). The log is viewable at `/ai-log` and exportable as JSON or CSV.

## Options considered

| Option                                         | Why not                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A server route with the site's own key         | Costs money per visitor and invites abuse of a public endpoint.                                               |
| A server route forwarding the visitor's key    | The key would pass through this site's server, which visitors would have to trust.                           |
| Precomputed LLM results committed to the repo  | No budget to produce them, and visitors could not check or repeat them.                                      |
| No LLM features                                | Leaves the most interesting comparison unanswered.                                                            |
| Browser-direct, bring your own key (chosen)    | No cost to the site, no key on the server, and anyone can repeat the evaluation with their own model choice. |

## Why

It keeps the governance simple to state and easy to verify in the code. The site never holds a secret, the visitor sees what is sent and where, every output is labelled as AI-generated, and a human decides what to do with it. The design is informed by the Australian Government's policy for the responsible use of AI in government, the transparency principles of the EU AI Act and the NIST AI Risk Management Framework. It does not claim compliance with any of them.

## What happened

- The site ships no LLM numbers. Because there is no budget, no reference run has been made, and the README and pages make no claim about how an LLM performs here. The harness computes everything in the visitor's browser when they run it.
- The baseline it is compared against is now reported with intervals. On all 154 dev claims the classifier scores 38.3% (31.0% to 46.2%) with retrieved evidence and 57.8% (49.9% to 65.3%) with gold evidence.
- The default sample of 20 claims gives accuracy intervals about 40 points wide. The page says so next to every result.

## What I'd change

- With a small budget, commit one reference run (model, date, seed and exported JSON) so the comparison is visible without a key, and repeat it to measure run-to-run variation.
- Add a contamination probe, such as asking the model to complete claims from the dataset, because the claims are public and may be in its training data.
- Offer a stratified sample by gold label, so a 20-claim run always includes refuted and disputed claims.
