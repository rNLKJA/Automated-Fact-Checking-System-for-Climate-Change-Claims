/**
 * Port of NLTK 3.8.1 `word_tokenize(text)` = Punkt sentence split followed by
 * `NLTKWordTokenizer.tokenize` on every sentence.
 *
 * In the 2024 pipeline `word_tokenize` only ever sees text whose ASCII
 * punctuation has already been stripped, so Punkt (which only breaks on
 * `.`, `?`, `!`) always returns a single sentence. The full regex cascade is
 * still ported so the function is faithful on arbitrary input; only Unicode
 * quotes (« “ ‘ „ » ” ’) and the MacIntyre contractions (cannot, gonna, ...)
 * actually fire on the pipeline's input.
 */
import { PY_WHITESPACE, pySplit } from "./pystr";

const W = "[\\p{L}\\p{N}_]"; // Python's Unicode \w
const S = `[${PY_WHITESPACE}]`; // Python's Unicode \s
const NOT_W_AHEAD = `(?!${W})`;
const NOT_W_BEHIND = `(?<!${W})`;

type Sub = [RegExp, string];

const STARTING_QUOTES: Sub[] = [
  [/([«“‘„]|[`]+)/gu, " $1 "],
  [/^"/u, "``"],
  [/(``)/gu, " $1 "],
  [/([ (\[{<])("|'{2})/gu, "$1 `` "],
  [new RegExp(`(')(?!re|ve|ll|m|t|s|d|n)(${W})${NOT_W_AHEAD}`, "giu"), "$1 $2"],
];

const ENDING_QUOTES: Sub[] = [
  [/([»”’])/gu, " $1 "],
  [/''/gu, " '' "],
  [/"/gu, " '' "],
  [/([^' ])('[sS]|'[mM]|'[dD]|') /gu, "$1 $2 "],
  [/([^' ])('ll|'LL|'re|'RE|'ve|'VE|n't|N'T) /gu, "$1 $2 "],
];

const PUNCTUATION: Sub[] = [
  [new RegExp(`([^.])(\\.)([\\])}>"'»”’ ]*)${S}*$`, "u"), "$1 $2 $3 "],
  [/([:,])([^\p{Nd}])/gu, " $1 $2"],
  [/([:,])$/u, " $1 "],
  [/\.{2,}/gu, " $& "],
  [/[;@#$%&]/gu, " $& "],
  [new RegExp(`([^.])(\\.)([\\])}>"']*)${S}*$`, "u"), "$1 $2$3 "],
  [/[?!]/gu, " $& "],
  [/([^'])' /gu, "$1 ' "],
  [/[*]/gu, " $& "],
];

const PARENS_BRACKETS: Sub = [/[\]\[(){}<>]/gu, " $& "];
const DOUBLE_DASHES: Sub = [/--/gu, " -- "];

const b = (body: string) => new RegExp(`${NOT_W_BEHIND}${body}`, "giu");
const CONTRACTIONS2: RegExp[] = [
  b(`(can)(not)${NOT_W_AHEAD}`),
  b(`(d)('ye)${NOT_W_AHEAD}`),
  b(`(gim)(me)${NOT_W_AHEAD}`),
  b(`(gon)(na)${NOT_W_AHEAD}`),
  b(`(got)(ta)${NOT_W_AHEAD}`),
  b(`(lem)(me)${NOT_W_AHEAD}`),
  b(`(more)('n)${NOT_W_AHEAD}`),
  b(`(wan)(na)(?=${S})`),
];
const CONTRACTIONS3: RegExp[] = [
  new RegExp(` ('t)(is)${NOT_W_AHEAD}`, "giu"),
  new RegExp(` ('t)(was)${NOT_W_AHEAD}`, "giu"),
];

/** `NLTKWordTokenizer().tokenize(text)` (convert_parentheses=False). */
export function treebankTokenize(input: string): string[] {
  let text = input;
  for (const [re, sub] of STARTING_QUOTES) text = text.replace(re, sub);
  for (const [re, sub] of PUNCTUATION) text = text.replace(re, sub);
  text = text.replace(PARENS_BRACKETS[0], PARENS_BRACKETS[1]);
  text = text.replace(DOUBLE_DASHES[0], DOUBLE_DASHES[1]);
  text = " " + text + " ";
  for (const [re, sub] of ENDING_QUOTES) text = text.replace(re, sub);
  for (const re of CONTRACTIONS2) text = text.replace(re, " $1 $2 ");
  for (const re of CONTRACTIONS3) text = text.replace(re, " $1 $2 ");
  return pySplit(text);
}

const SENT_END = /[.?!]/u;
const TRAILING_WS = new RegExp(`${S}+$`, "u");

/**
 * `nltk.word_tokenize(text)`. Punkt sentence splitting is only reproduced for
 * the case the pipeline exercises (no sentence-final punctuation => one
 * sentence, right-stripped). Inputs that still contain `.?!` throw, so a
 * future caller cannot silently diverge from NLTK.
 */
export function wordTokenize(text: string): string[] {
  if (SENT_END.test(text)) {
    throw new Error("wordTokenize: Punkt splitting of '.', '?', '!' is not ported");
  }
  const sentence = text.replace(TRAILING_WS, "");
  return sentence.length === 0 ? [] : treebankTokenize(sentence);
}
