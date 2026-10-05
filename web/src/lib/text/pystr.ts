/**
 * Small helpers that reproduce Python `str` semantics the 2024 pipeline relied on.
 */

/** Characters for which Python's `str.isspace()` is true (and `re`'s Unicode `\s` matches). */
export const PY_WHITESPACE =
  "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

const SPLIT_RE = new RegExp(`[${PY_WHITESPACE}]+`, "u");

/** Python `s.split()` (no separator): split on runs of whitespace, drop empties. */
export function pySplit(s: string): string[] {
  return s.split(SPLIT_RE).filter((t) => t.length > 0);
}

const ALPHA_RE = /^\p{L}+$/u;

/** Python `str.isalpha()`: non-empty and every char is in Unicode category L*. */
export function pyIsAlpha(s: string): boolean {
  return ALPHA_RE.test(s);
}

/** Python `string.punctuation`. */
export const PY_PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

const PUNCT_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

/**
 * The notebook's two punctuation passes:
 *   for c in string.punctuation: text = text.replace(c, " " + c + " ")
 *   text = text.translate(str.maketrans("", "", string.punctuation))
 * which together turn every ASCII punctuation character into two spaces.
 */
export function splitAndStripPunctuation(text: string): string {
  return text.replace(PUNCT_RE, "  ");
}

function isCased(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase();
}

/** Python `str.title()`. */
export function pyTitle(s: string): string {
  let out = "";
  let prevCased = false;
  for (const ch of s) {
    if (isCased(ch)) {
      out += prevCased ? ch.toLowerCase() : ch.toUpperCase();
      prevCased = true;
    } else {
      out += ch;
      prevCased = false;
    }
  }
  return out;
}
