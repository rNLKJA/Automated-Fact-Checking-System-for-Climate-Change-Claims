/**
 * `preprocess_and_tokenize` from the 2024 notebook (cell 9), step for step:
 *
 *   1. contractions.fix(text)            -> fixContractions
 *   2. text.lower()
 *   3. pad + strip ASCII punctuation     -> splitAndStripPunctuation
 *   4. nltk.word_tokenize                -> wordTokenize
 *   5. drop NLTK English stopwords and non-alphabetic tokens
 *   6. PorterStemmer().stem               -> porterStem
 */
import { fixContractions } from "./contractions";
import { porterStem } from "./porter";
import { pyIsAlpha, splitAndStripPunctuation } from "./pystr";
import { ENGLISH_STOPWORDS } from "./data/stopwords-data";
import { wordTokenize } from "./tokenize";

const STOPWORDS: ReadonlySet<string> = new Set(ENGLISH_STOPWORDS);

export type PreprocessTrace = {
  expanded: string;
  lowered: string;
  stripped: string;
  tokens: string[];
  kept: string[];
  stems: string[];
};

/** Same as `preprocess_and_tokenize`, but returns every intermediate stage (for the UI). */
export function preprocessTrace(text: string): PreprocessTrace {
  const expanded = fixContractions(text);
  const lowered = expanded.toLowerCase();
  const stripped = splitAndStripPunctuation(lowered);
  const tokens = wordTokenize(stripped);
  const kept = tokens.filter((w) => !STOPWORDS.has(w) && pyIsAlpha(w));
  const stems = kept.map(porterStem);
  return { expanded, lowered, stripped, tokens, kept, stems };
}

/** `preprocess_and_tokenize(text)` -> list of stemmed tokens. */
export function preprocessAndTokenize(text: string): string[] {
  return preprocessTrace(text).stems;
}
