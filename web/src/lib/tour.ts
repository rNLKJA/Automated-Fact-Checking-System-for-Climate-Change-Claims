/**
 * The guided tour: three recorded journeys and the key-feature screenshots.
 * The recordings are made by `pnpm showcase` (e2e/showcase.spec.ts), which
 * reads the step captions below, so the captions burned into each video, its
 * caption track, and the step lists and transcripts on /tour share one source.
 */
import timings from "./tour-timings.json";

export type TourStep = {
  /** the caption shown in the video for this step */
  text: string;
  /** what is on screen during the step, for the transcript */
  detail: string;
  /** a pill shown beside the caption (labels mocked AI output) */
  badge?: string;
};

export type TourJourney = {
  slug: string;
  title: string;
  summary: string;
  /** file stem under web/public/showcase: .mp4, .webp poster, .vtt captions */
  file: string;
  /** the recording shows a mocked AI response, labelled as such */
  mocked: boolean;
  /** the poster frame: this many ms after the caption of this step appears */
  poster: { step: number; afterMs: number };
  steps: readonly TourStep[];
};

export const MOCK_BADGE = "Mocked AI response for illustration";

export const TOUR_JOURNEYS: readonly TourJourney[] = [
  {
    slug: "explore-dev-set",
    title: "Explore the dev set",
    summary:
      "Browse the 154 dev claims, narrow them to the ones where retrieval found a gold passage, then open one to compare the annotators' evidence with what the 2024 system retrieved and how it voted.",
    file: "1-explore-dev-set",
    mocked: false,
    poster: { step: 5, afterMs: 3500 },
    steps: [
      {
        text: "All 154 dev claims: the annotators' label, the model's verdict and the gold evidence it found",
        detail:
          "The Explore page opens on four headline figures with 95% intervals: mean evidence F of 0.043, 13 of 154 claims with any gold passage found, verdict accuracy of 38.3% and 47% of claims on the fallback path.",
      },
      {
        text: "Filter to the claims where the 2024 retrieval found at least one gold passage",
        detail:
          "Choosing “Found gold” in the Evidence filter narrows the list to the 13 claims where retrieval found a gold passage.",
      },
      {
        text: "Open a claim to compare gold and retrieved evidence side by side",
        detail:
          "Dev claim 752, “[South Australia] has the most expensive electricity in the world”, opens on its own page with its claim tags and the annotators' label, Supports.",
      },
      {
        text: "The retrained Transformer's verdict three ways, with its class probabilities",
        detail:
          "Three cards show the verdict under the notebook protocol, one claim at a time, and with gold evidence. Each has bars for all four class probabilities and says whether it matches the label.",
      },
      {
        text: "Retrieved passages (left) against the annotators' gold evidence (right); hits are marked gold",
        detail:
          "The 2024 submission retrieved four passages, two of them gold, so precision is 0.50, recall 1.00 and F 0.67. Each passage shows its tags, cosine similarity, tag overlap and score.",
      },
      {
        text: "Switch between the submitted 2024 retrieval and the faithful re-runs, with P, R and F per run",
        detail:
          "The tabs switch between the saved 2024 output, the re-run of the submitted rule, the notebook's rule and the raw-claim variant, each with its own scores.",
      },
    ],
  },
  {
    slug: "check-a-claim",
    title: "Check a claim",
    summary:
      "Type a new claim and run the original pipeline on the server: TF-IDF retrieval over a pruned Wikipedia index, then the from-scratch Transformer, with every score and word contribution shown.",
    file: "2-check-a-claim",
    mocked: false,
    poster: { step: 3, afterMs: 3500 },
    steps: [
      {
        text: "Check a claim: type any sentence about climate science",
        detail:
          "On the Try page the claim “Sea levels are rising faster than ever because glaciers are melting.” is typed into the claim box. The submitted 2024 scoring rule is selected.",
      },
      {
        text: "Run the original 2024 pipeline: TF-IDF evidence retrieval, then the from-scratch Transformer",
        detail:
          "Pressing “Check this claim” sends the sentence to the server, which runs the TypeScript ports of the original preprocessing, retrieval and classifier.",
      },
      {
        text: "The verdict with all four class probabilities, beside the model's dev accuracy and its 95% CI",
        detail:
          "The model answers Supports with 46.1% probability, ahead of not enough info at 27.3%. A note says the model is right on 37.7% of dev claims (95% CI 30.4% to 45.5%), no better than always answering “supports”.",
      },
      {
        text: "The passages it retrieved, each with its cosine similarity and tag-overlap scores",
        detail:
          "Four retrieved passages about glacier and ice-sheet melt and sea-level rise are listed with their shared tags, cosine, overlap and combined score. A banner explains that this sentence was searched against a 39,666-passage subset.",
      },
      {
        text: "Under the hood: the notebook's preprocessing, the TF-IDF tag vector and each word's exact contribution",
        detail:
          "The preprocessing panel shows the tokens kept and dropped, the tag TF-IDF weights, and a chart of how much each word pushes the verdict towards each label.",
      },
      {
        text: "Or pick a one-click example, checked against the full 1.19M-passage search at build time",
        detail:
          "Clicking the example “Arctic sea ice has been shrinking for decades.” runs it straight away. A green note confirms that it returns the same passages as the full 2024 search over all 1.19M passages.",
      },
    ],
  },
  {
    slug: "model-vs-llm",
    title: "Original model vs LLM",
    summary:
      "The bring-your-own-key settings, then the paired evaluation harness filled with a seeded mock run (no model was called, no key was entered) to show how the comparison is scored and reported.",
    file: "3-model-vs-llm",
    mocked: true,
    poster: { step: 5, afterMs: 2300 },
    steps: [
      {
        text: "Original model vs LLM: the same dev claims and the same evidence, scored as a paired comparison",
        detail:
          "The LLM evaluation page sets out the protocol: the same seeded sample of dev claims, a structured JSON answer, retrieved and gold evidence conditions, and paired statistics.",
      },
      {
        text: "Bring your own key: AI is optional, and the key stays in this browser and goes only to the provider",
        detail:
          "“Add key” opens the AI settings dialog: Anthropic (default) or OpenAI, the model, a key field, “Remember on this device” (off keeps the key in sessionStorage for this tab only) and a note that the key never reaches the site.",
      },
      {
        text: "No key is entered in this demo. Cancel, then load a saved run file instead",
        detail: "The dialog is cancelled without entering a key.",
      },
      {
        text: "A seeded mock run (no model was called) loaded through “Load a saved run”",
        detail:
          "A run file generated by the tour script with a seeded random generator is loaded. Its model is named “mocked-llm-for-illustration” and every rationale says no model was called.",
        badge: MOCK_BADGE,
      },
      {
        text: "Accuracy and macro-F1 with 95% intervals, the paired difference, McNemar's exact test",
        detail:
          "For each evidence condition the page shows accuracy (Wilson interval) and macro-F1 (bootstrap interval) for the mock and the classifier, the paired difference, McNemar's exact test, Cohen's h, citation validity and evidence F. The numbers describe the mock, not any real model.",
        badge: MOCK_BADGE,
      },
      {
        text: "Claim by claim, each LLM verdict is labelled AI-generated beside the classifier's",
        detail:
          "The claim table lists each sampled claim with its gold label, the classifier's verdict and the mock's verdict for both conditions, marked right or wrong.",
        badge: MOCK_BADGE,
      },
    ],
  },
];

/** Start time in seconds of each step in each recording (written by scripts/showcase-media.mjs). */
export function stepTimes(journey: TourJourney): readonly number[] | null {
  const t = (timings as Record<string, number[] | undefined>)[journey.slug];
  return t && t.length === journey.steps.length ? t : null;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type TourScreen = {
  file: string;
  title: string;
  caption: string;
  /** full-size width and height of the WebP under /showcase/screens */
  width: number;
  height: number;
  mobile?: boolean;
};

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 585, height: 1266, mobile: true };

/** Key-feature screenshots: 1440x900 desktop, 390x844 phone (taken at 2x, kept at 1.5x). */
export const TOUR_SCREENS: readonly TourScreen[] = [
  {
    file: "01-landing-light",
    title: "Landing, light theme",
    caption: "The question, the pipeline and a real dev claim with its evidence and both verdicts.",
    ...DESKTOP,
  },
  {
    file: "02-landing-dark",
    title: "Landing, dark theme",
    caption: "The same page in the dark theme.",
    ...DESKTOP,
  },
  {
    file: "03-try-verdict",
    title: "Check a claim",
    caption:
      "A typed claim, the verdict and all four class probabilities, beside the dev-accuracy CI.",
    ...DESKTOP,
  },
  {
    file: "04-try-evidence",
    title: "Retrieved evidence",
    caption: "Each retrieved passage with its shared tags, cosine similarity and tag overlap.",
    ...DESKTOP,
  },
  {
    file: "05-explore-dev-set",
    title: "Explore the dev set",
    caption: "Headline figures with 95% CIs, filters, and all 154 dev claims.",
    ...DESKTOP,
  },
  {
    file: "06-claim-evidence",
    title: "Gold vs retrieved evidence",
    caption: "One claim's retrieved passages against the annotators' gold evidence.",
    ...DESKTOP,
  },
  {
    file: "07-results-uncertainty",
    title: "Results with intervals",
    caption: "Accuracy with Wilson CIs and bootstrap intervals for macro-F1 and retrieval.",
    ...DESKTOP,
  },
  {
    file: "08-pipeline-walkthrough",
    title: "Pipeline walkthrough",
    caption:
      "One claim followed through preprocessing, tagging, scoring, selection and classification.",
    ...DESKTOP,
  },
  {
    file: "09-byok-settings",
    title: "Bring your own key",
    caption: "AI settings: your own key, kept in this browser and never sent to this site.",
    ...DESKTOP,
  },
  {
    file: "10-llm-eval-mocked",
    title: "LLM evaluation (mocked run)",
    caption:
      "The paired harness filled with a labelled mock run: the layout only, no model called.",
    ...DESKTOP,
  },
  {
    file: "11-methods",
    title: "Methods and decisions",
    caption:
      "Provenance, evaluation design, limitations, the AI use statement and decision records.",
    ...DESKTOP,
  },
  {
    file: "12-model-card",
    title: "Model card",
    caption: "Intended use, training data, evaluation with intervals and known failure modes.",
    ...DESKTOP,
  },
  {
    file: "13-mobile-landing",
    title: "Phone: landing",
    caption: "The landing page at 390 px wide.",
    ...PHONE,
  },
  {
    file: "14-mobile-try-verdict",
    title: "Phone: a verdict",
    caption: "A verdict and its probabilities at 390 px wide.",
    ...PHONE,
  },
];
