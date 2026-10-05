/**
 * Port of `contractions.fix(text)` (contractions 0.1.73, defaults
 * `leftovers=True, slang=True`), which delegates to
 * `textsearch.TextSearch("insensitive", "norm").replace(text)`.
 *
 * TextSearch walks an Aho-Corasick automaton over the lower-cased text. For
 * every end position it yields all dictionary keys ending there, longest
 * first; matches must not touch an ASCII word character on either side, and
 * overlapping matches are resolved by the "keep the longer one" rule below.
 * The dictionary (`CONTRACTION_ENTRIES`) is exported from the automaton itself
 * by `scripts/build_web_data.py`, so key order/overwrites are identical.
 */
import { pyTitle } from "./pystr";
import { CONTRACTION_ENTRIES } from "./data/contractions-data";

type Entry = { length: number; value: string };

const DICT = new Map<string, Entry>();
let MAX_KEY = 0;
for (const [key, length, value] of CONTRACTION_ENTRIES) {
  DICT.set(key, { length, value });
  MAX_KEY = Math.max(MAX_KEY, key.length);
}

const BOUND = /[A-Za-z0-9_]/;

function sentenceCase(k: string): string {
  return k.slice(0, 1).toUpperCase() + k.slice(1).toLowerCase();
}

function applyCase(match: string, value: string): string {
  if (match === match.toUpperCase()) return value.toUpperCase();
  if (match === pyTitle(match)) return pyTitle(value);
  if (match === match.toLowerCase()) return value.toLowerCase();
  if (match === sentenceCase(match)) return sentenceCase(value);
  return value;
}

type Kept = { len: number; start: number; stop: number; norm: string };

/** `contractions.fix(text)` */
export function fixContractions(text: string): string {
  const lower = text.toLowerCase();
  const n = lower.length;
  const keywords: Kept[] = [{ len: Number.NaN, start: Number.NaN, stop: 0, norm: "" }];
  let currentStop = -1;

  for (let end = 0; end < n; end++) {
    const maxLen = Math.min(MAX_KEY, end + 1);
    for (let len = maxLen; len >= 1; len--) {
      const entry = DICT.get(lower.slice(end - len + 1, end + 1));
      if (entry === undefined) continue;
      const start = end - entry.length + 1;
      const stop = end + 1;
      // bounds_check on the ORIGINAL text
      if (stop !== text.length && BOUND.test(text[stop] ?? "")) continue;
      if (start !== 0 && BOUND.test(text[start - 1] ?? "")) continue;
      const norm = applyCase(text.slice(start, stop), entry.value);
      if (start >= currentStop) {
        currentStop = stop;
        keywords.push({ len: currentStop - start, start, stop: currentStop, norm });
      } else if (stop - start > keywords[keywords.length - 1].len) {
        currentStop = Math.max(currentStop, stop);
        keywords[keywords.length - 1] = {
          len: currentStop - start,
          start,
          stop: currentStop,
          norm,
        };
      }
    }
  }
  keywords.push({ len: Number.NaN, start: text.length, stop: Number.NaN, norm: "" });

  let out = "";
  for (let i = 0; i + 1 < keywords.length; i++) {
    const a = keywords[i];
    const b = keywords[i + 1];
    out += pySlice(text, a.stop, b.start) + b.norm;
  }
  return out;
}

/** Python `text[a:b]` for non-negative a, b (empty when a >= b). */
function pySlice(text: string, a: number, b: number): string {
  return a >= b ? "" : text.slice(a, b);
}
