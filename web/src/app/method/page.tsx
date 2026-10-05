import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/common/section";
import { buildModelInput, encode } from "@/lib/classifier";
import { fixed, int } from "@/lib/format";
import { claimTagsOf, RULES } from "@/lib/retrieval";
import { topKeywords } from "@/lib/tfidf";
import { preprocessAndTokenize, preprocessTrace } from "@/lib/text/preprocess";
import { getClaimDetail, getEvidence } from "@/server/claims";
import { getDb, getMeta } from "@/server/db";
import { getClassifier, getKeywordModel } from "@/server/models";
import { getOverview } from "@/server/stats";

export const metadata: Metadata = {
  title: "Method",
  description:
    "A step-by-step walk through the 2024 pipeline with a real claim: preprocessing, keyword tags, TF-IDF scoring, the selection rule and the from-scratch Transformer.",
};

const EXAMPLE_ID = "claim-752";

export default function MethodPage() {
  const o = getOverview();
  const d = getClaimDetail(EXAMPLE_ID);
  if (!d) throw new Error(`${EXAMPLE_ID} missing from the database`);
  const claim = d.claim.text;
  const trace = preprocessTrace(claim);
  const tags = claimTagsOf(claim, preprocessAndTokenize);
  const run = d.runs.find((r) => r.summary.run === "saved_2024")!;
  const goldPassage = d.gold[0];
  const keyword = getKeywordModel();
  const keywords = topKeywords(keyword, goldPassage.text, preprocessAndTokenize);
  const artifact = getMeta<{ term: string; passages: number; of: number }>("tag_artifact");
  const artifactExample = getDb()
    .prepare(
      "SELECT evidence_id, text, tags FROM evidence WHERE tags LIKE ? AND length(text) < 70 ORDER BY ord LIMIT 1",
    )
    .get(`%${artifact.term}%`) as { evidence_id: string; text: string; tags: string } | undefined;
  const artifactKeywords = artifactExample
    ? topKeywords(keyword, artifactExample.text, preprocessAndTokenize)
    : [];
  const clf = getClassifier();
  const evidenceStems = getEvidence(run.passages.map((p) => p.id)).map((p) =>
    preprocessAndTokenize(p.text),
  );
  const modelInput = buildModelInput(trace.stems, evidenceStems);
  const ids = encode(clf, modelInput);
  const pad = clf.vocab.get("[PAD]");
  const nPad = ids.filter((i) => i === pad).length;

  return (
    <>
      <PageHeader eyebrow="Method" title="One claim, through every stage of the pipeline">
        Following{" "}
        <Link
          href={`/explore/${EXAMPLE_ID}`}
          className="text-foreground underline underline-offset-4"
        >
          dev claim 752
        </Link>{" "}
        from raw text to verdict. Every value on this page is computed live by the TypeScript ports,
        the same code the Try-it page runs.
      </PageHeader>

      <div className="mx-auto max-w-4xl space-y-14 px-4 py-12 sm:px-6">
        <blockquote className="border-l-2 border-stripe-warm pl-5 font-serif text-2xl leading-snug sm:text-3xl">
          &ldquo;{claim}&rdquo;
        </blockquote>

        <Step n={1} title="Preprocess" code="preprocess_and_tokenize · notebook cell 9">
          <p>
            Contractions are expanded with the <code>contractions</code> package. Text is
            lowercased, and every ASCII punctuation mark becomes a space (so{" "}
            <code>sentence.abc</code> splits in two). NLTK tokenises, English stopwords and
            non-alphabetic tokens are dropped, and the Porter stemmer reduces what is left.
          </p>
          <Trace
            rows={[
              ["tokens", trace.tokens.join("  ")],
              ["kept", trace.kept.join("  ")],
              ["stems", trace.stems.join("  ")],
            ]}
          />
        </Step>

        <Step n={2} title="Tag the claim and the evidence" code="cells 10, 14–19">
          <p>
            A claim&rsquo;s <em>tags</em> are simply its stems, sorted: <code>{tags}</code>. The
            evidence was tagged once, offline, across all 1.2M passages: each passage keeps its ten
            highest-weighted features under a TF-IDF model with 20,000 uni- to tri-gram features,
            and only single words survive. Here is the first gold passage for this claim:
          </p>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-serif text-lg leading-relaxed">{goldPassage.text}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {keywords.map((k) => (
                <li key={k.term} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {k.term} <span className="text-muted-foreground">{fixed(k.weight, 2)}</span>
                </li>
              ))}
            </ul>
          </div>
          {artifactExample && (
            <p>
              A quirk: numpy&rsquo;s <code>argsort</code> pads short passages&rsquo; top ten with
              zero-weight features, in an order that depends on its unstable quicksort. The last
              vocabulary entry, <span lang="ar">{artifact.term}</span>, is alphabetic, so it ended
              up in {int(artifact.passages)} passages&rsquo; tags (
              {fixed((100 * artifact.passages) / artifact.of, 1)}%). For &ldquo;
              {artifactExample.text}&rdquo; the tags are{" "}
              {artifactKeywords.map((k, i) => (
                <span key={k.term}>
                  {i > 0 && ", "}
                  <code lang={k.term === artifact.term ? "ar" : undefined}>{k.term}</code>
                  {k.weight === 0 && <span className="text-xs"> (weight 0)</span>}
                </span>
              ))}
              . The port reimplements numpy&rsquo;s introsort so these tags come out identical.
            </p>
          )}
        </Step>

        <Step n={3} title="Score every passage" code="find_top_evidence · cell 24">
          <p>
            Claim tags and passage tags are vectorised by a second, 1,000-term TF-IDF model (the
            tags are stemmed again on the way in). Each passage then gets three numbers:
          </p>
          <ul className="grid gap-3 sm:grid-cols-3">
            <Formula name="cosine" body="cosine similarity of the two tag vectors" />
            <Formula name="overlap" body="shared tags ÷ the smaller tag set" />
            <Formula name="score" body="cosine + overlap (the notebook adds the cosine twice)" />
          </ul>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Scores of the passages selected for claim 752</caption>
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-normal">
                    Selected passage
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    cosine
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    overlap
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    score
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-normal">
                    shared
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {run.passages.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <span className="line-clamp-1">{p.text}</span>
                      {p.isGold && <span className="text-xs text-muted-foreground">gold ✓</span>}
                    </th>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular">
                      {fixed(p.sim)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular">
                      {fixed(p.overlap)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular">
                      {fixed(p.combined)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular">{p.maxMatch}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step n={4} title="Select" code="cell 24">
          <p>
            Keep passages with cosine &gt; {RULES.submission.sim} and overlap &gt;{" "}
            {RULES.submission.overlap}. Sort them by score and keep only those sharing the most tags
            with the claim, at most {RULES.submission.topN}. For this claim {run.summary.nFiltered}{" "}
            passages passed and the {run.passages.length} sharing {run.passages[0]?.maxMatch} tags
            were kept. They include {run.summary.nCorrect} of the {d.gold.length} gold passages (F ={" "}
            {fixed(run.summary.f, 2)}). When nothing passes the filter, the top six by score are
            returned instead. That happened for{" "}
            {Math.round(o.retrieval.dev_fallback_share_submission * 100)}% of dev claims.
          </p>
        </Step>

        <Step n={5} title="Classify" code="cells 33–37, 51">
          <p>
            The claim&rsquo;s stems and the stems of every retrieved passage are joined into one
            string. The string is wrapped in <code>[CLS] … [SEP]</code>, mapped to a{" "}
            {int(o.model.vocab_size)}-word vocabulary built from the training claims and their gold
            evidence, and cut or padded to {o.model.max_len} tokens. This claim uses{" "}
            {o.model.max_len - nPad} real tokens and {nPad} <code>[PAD]</code>s.
          </p>
          <Trace
            rows={[
              [
                "model input",
                modelInput.length > 420 ? `${modelInput.slice(0, 420)}…` : modelInput,
              ],
            ]}
          />
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm sm:grid-cols-4">
            {[
              ["Embedding", `${o.model.model_dim}-d`],
              ["Encoder", `${o.model.num_encoder_layers} layers × ${o.model.num_heads} heads`],
              ["Feed-forward", `${o.model.dim_feedforward}`],
              ["Training", `${o.model.epochs} epochs, Adam lr ${o.model.lr.toExponential(0)}`],
            ].map(([k, v]) => (
              <div key={k} className="bg-card p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-mono text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            <strong className="font-medium text-foreground">
              The quirk that makes it explainable.
            </strong>{" "}
            PyTorch&rsquo;s <code>nn.TransformerEncoder</code> expects{" "}
            <code>(sequence, batch, features)</code> unless <code>batch_first=True</code>. The
            notebook passes <code>(batch, sequence, features)</code>, so attention ran across the 16
            claims of a mini-batch at each position, never across the words of a claim. The
            positional encoding likewise marks a claim&rsquo;s place in the batch, not a
            word&rsquo;s place in the sentence. Given one claim on its own, every position is
            transformed independently and the mean-pooled output becomes
          </p>
          <p className="rounded-xl bg-muted px-4 py-3 text-center font-mono text-sm">
            logits = bias + (1/128) × Σ<sub>t</sub> g[token<sub>t</sub>]
          </p>
          <p>
            Here <code>g</code> is a {int(o.model.vocab_size)} × 4 table exported from the retrained
            weights. It matches PyTorch to within{" "}
            {o.classifier.token_table_max_err.toExponential(1)}, so the site needs a{" "}
            {Math.round((o.model.vocab_size * 4 * 4) / 1000)} KB table, not a{" "}
            {(o.classifier.params_transformer / 1e6).toFixed(1)}M-parameter network, and can show
            each word&rsquo;s exact share of the verdict. The notebook evaluated dev claims in
            batches of 16, so its predictions also depend on their neighbours in the file. The{" "}
            <Link href="/explore" className="text-foreground underline underline-offset-4">
              Explore
            </Link>{" "}
            page shows both protocols.
          </p>
        </Step>

        <section
          id="data"
          className="scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <h2 className="text-2xl font-medium">Data &amp; provenance</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-border">
            <li>
              <span className="text-foreground">Claims</span> come from the subject&rsquo;s public
              project repository ({int(o.claims.train)} train, {int(o.claims.dev)} dev,{" "}
              {int(o.claims.test)} unlabelled test). The test labels were never released, so
              test-set results exist only as the leaderboard score in the report.
            </li>
            <li>
              <span className="text-foreground">Evidence</span> is a pruned index of{" "}
              {int(o.index.passages)} Wikipedia sentences out of the course&rsquo;s{" "}
              {int(o.index.corpus_total)}: every gold passage for the train and dev claims (
              {int(o.index.gold)}), every passage the rule could select for a dev or test claim (
              {int(o.index.pool)}), and a seeded random sample ({int(o.index.sample)}). The full
              corpus is not redistributed.
            </li>
            <li>
              <span className="text-foreground">Model artefacts</span> (vectorizer vocabularies, the
              token table, retrieval runs and predictions) are derived by the build scripts in the
              repository and stored in a read-only SQLite file queried on the server.
            </li>
            <li>
              The assignment specification is paraphrased, not reproduced. The team&rsquo;s own
              report and notebook are kept in the GitHub repository.
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

function Step({
  n,
  title,
  code,
  children,
}: {
  n: number;
  title: string;
  code: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${n}`} className="grid gap-4 sm:grid-cols-[3rem_1fr]">
      <span className="font-serif text-3xl text-muted-foreground tabular" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 space-y-4 leading-relaxed text-muted-foreground [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground">
        <div>
          <h2 id={`step-${n}`} className="text-2xl font-medium text-foreground">
            {title}
          </h2>
          <p className="mt-1 font-mono text-xs">{code}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function Trace({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 sm:grid-cols-[6.5rem_1fr]">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-mono text-[0.8rem] break-words text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Formula({ name, body }: { name: string; body: string }) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <p className="font-mono text-sm text-foreground">{name}</p>
      <p className="mt-1 text-xs">{body}</p>
    </li>
  );
}
