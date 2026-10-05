import "server-only";

import { buildModelInput, classify, tokenContributions } from "@/lib/classifier";
import { claimTagsOf, RULES, scoreEvidence, selectEvidence, type RuleId } from "@/lib/retrieval";
import { tfidfTransform } from "@/lib/tfidf";
import { preprocessAndTokenize, preprocessTrace } from "@/lib/text/preprocess";
import { pySplit } from "@/lib/text/pystr";
import type { CheckResponse } from "@/lib/types";
import { getEvidence, goldClaimsFor } from "./claims";
import { getClassifier, getEvidenceIndex, getTagModel } from "./models";

/**
 * The whole 2024 system for one free-text claim:
 * preprocess -> claim tags -> tag TF-IDF -> score + select passages from the
 * pruned index -> Transformer on claim + evidence stems.
 * Throws `EmptyClaimError` when nothing is left after stopword removal.
 */
export function checkClaim(claim: string, ruleId: RuleId = "submission"): CheckResponse {
  const rule = RULES[ruleId];
  const trace = preprocessTrace(claim);
  const keptSet = new Set(trace.kept);
  const claimTags = claimTagsOf(claim, preprocessAndTokenize);

  const tagModel = getTagModel();
  const claimVec = tfidfTransform(tagModel, claimTags, preprocessAndTokenize);
  const index = getEvidenceIndex();

  const t0 = performance.now();
  const scored = scoreEvidence(claimTags, claimVec, index, rule.simWeight);
  const selection = selectEvidence(scored, rule);
  const tookMs = performance.now() - t0;

  const ids = selection.selected.map((s) => s.evidenceId);
  const passages = getEvidence(ids);
  const gold = goldClaimsFor(ids);
  const claimWords = new Set(pySplit(claimTags));

  const clf = getClassifier();
  const modelInput = buildModelInput(
    trace.stems,
    passages.map((p) => preprocessAndTokenize(p.text)),
  );
  const prediction = classify(clf, modelInput);
  const pad = clf.vocab.get("[PAD]");
  const words = pySplit(modelInput).length + 2; // + [CLS] and [SEP]

  const contributions = tokenContributions(clf, prediction.ids)
    .sort((a, b) => maxAbs(b.centred) - maxAbs(a.centred))
    .map(({ token, count, centred }) => ({ token, count, centred }));

  return {
    claim,
    rule: ruleId,
    trace: {
      expanded: trace.expanded,
      tokens: trace.tokens,
      kept: trace.kept,
      stems: trace.stems,
      dropped: trace.tokens.filter((t) => !keptSet.has(t)),
    },
    claimTags,
    tagTerms: claimVec.idx
      .map((j, k) => ({ term: tagModel.terms[j], weight: claimVec.w[k] }))
      .sort((a, b) => b.weight - a.weight),
    retrieval: {
      path: selection.path,
      nFiltered: selection.nFiltered,
      indexSize: index.length,
      tookMs,
      passages: selection.selected.map((s, i) => {
        const p = passages[i];
        return {
          id: s.evidenceId,
          text: p?.text ?? "",
          tags: p?.tags ?? null,
          sim: s.sim,
          overlap: s.overlap,
          combined: s.combined,
          maxMatch: s.maxMatch,
          matchedTags: pySplit(p?.tags ?? "").filter((t) => claimWords.has(t)),
          goldFor: gold.get(s.evidenceId) ?? [],
        };
      }),
    },
    classification: {
      label: prediction.label,
      probs: prediction.probs,
      logits: prediction.logits,
      bias: clf.bias,
      inputTokens: Math.min(words, clf.maxLen),
      truncated: words > clf.maxLen,
      unknownTokens: prediction.unknownTokens,
      padding: prediction.ids.filter((id) => id === pad).length,
      contributions,
    },
  };
}

function maxAbs(xs: number[]): number {
  return Math.max(...xs.map(Math.abs));
}
