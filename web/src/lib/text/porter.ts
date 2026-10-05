/**
 * Port of NLTK 3.8.1 `PorterStemmer` in its default `NLTK_EXTENSIONS` mode,
 * which is what the 2024 notebook used (`PorterStemmer()`).
 *
 * The structure mirrors `nltk/stem/porter.py` rule-for-rule so the two can be
 * diffed; parity is checked against NLTK output in `porter.test.ts`.
 */

type Condition = ((stem: string) => boolean) | null;
type Rule = [suffix: string, replacement: string, condition: Condition];

const IRREGULAR_FORMS: Record<string, string[]> = {
  sky: ["sky", "skies"],
  die: ["dying"],
  lie: ["lying"],
  tie: ["tying"],
  news: ["news"],
  inning: ["innings", "inning"],
  outing: ["outings", "outing"],
  canning: ["cannings", "canning"],
  howe: ["howe"],
  proceed: ["proceed"],
  exceed: ["exceed"],
  succeed: ["succeed"],
};

const POOL = new Map<string, string>();
for (const [key, forms] of Object.entries(IRREGULAR_FORMS)) {
  for (const form of forms) POOL.set(form, key);
}

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function isConsonant(word: string, i: number): boolean {
  if (VOWELS.has(word[i])) return false;
  if (word[i] === "y") {
    if (i === 0) return true;
    return !isConsonant(word, i - 1);
  }
  return true;
}

function measure(stem: string): number {
  let cv = "";
  for (let i = 0; i < stem.length; i++) cv += isConsonant(stem, i) ? "c" : "v";
  // Python's str.count counts non-overlapping occurrences; "vc" cannot overlap.
  let count = 0;
  for (let i = 0; i + 1 < cv.length; i++) if (cv[i] === "v" && cv[i + 1] === "c") count++;
  return count;
}

const hasPositiveMeasure = (stem: string) => measure(stem) > 0;

function containsVowel(stem: string): boolean {
  for (let i = 0; i < stem.length; i++) if (!isConsonant(stem, i)) return true;
  return false;
}

function endsDoubleConsonant(word: string): boolean {
  const n = word.length;
  return n >= 2 && word[n - 1] === word[n - 2] && isConsonant(word, n - 1);
}

function endsCvc(word: string): boolean {
  const n = word.length;
  return (
    (n >= 3 &&
      isConsonant(word, n - 3) &&
      !isConsonant(word, n - 2) &&
      isConsonant(word, n - 1) &&
      !["w", "x", "y"].includes(word[n - 1])) ||
    // NLTK extension: two-letter vowel+consonant words also count
    (n === 2 && !isConsonant(word, 0) && isConsonant(word, 1))
  );
}

function replaceSuffix(word: string, suffix: string, replacement: string): string {
  if (suffix === "") return word + replacement;
  return word.slice(0, word.length - suffix.length) + replacement;
}

function applyRuleList(word: string, rules: Rule[]): string {
  for (const [suffix, replacement, condition] of rules) {
    if (suffix === "*d" && endsDoubleConsonant(word)) {
      const stem = word.slice(0, -2);
      if (condition === null || condition(stem)) return stem + replacement;
      return word;
    }
    if (word.endsWith(suffix)) {
      const stem = replaceSuffix(word, suffix, "");
      if (condition === null || condition(stem)) return stem + replacement;
      return word;
    }
  }
  return word;
}

function step1a(word: string): string {
  if (word.endsWith("ies") && word.length === 4) return replaceSuffix(word, "ies", "ie");
  return applyRuleList(word, [
    ["sses", "ss", null],
    ["ies", "i", null],
    ["ss", "ss", null],
    ["s", "", null],
  ]);
}

function step1b(word: string): string {
  if (word.endsWith("ied")) {
    if (word.length === 4) return replaceSuffix(word, "ied", "ie");
    return replaceSuffix(word, "ied", "i");
  }
  if (word.endsWith("eed")) {
    const stem = replaceSuffix(word, "eed", "");
    if (measure(stem) > 0) return stem + "ee";
    return word;
  }
  let succeeded = false;
  let intermediate = "";
  for (const suffix of ["ed", "ing"]) {
    if (word.endsWith(suffix)) {
      intermediate = replaceSuffix(word, suffix, "");
      if (containsVowel(intermediate)) {
        succeeded = true;
        break;
      }
    }
  }
  if (!succeeded) return word;
  const last = intermediate[intermediate.length - 1];
  return applyRuleList(intermediate, [
    ["at", "ate", null],
    ["bl", "ble", null],
    ["iz", "ize", null],
    ["*d", last, () => !["l", "s", "z"].includes(last)],
    ["", "e", (stem) => measure(stem) === 1 && endsCvc(stem)],
  ]);
}

function step1c(word: string): string {
  return applyRuleList(word, [
    ["y", "i", (stem) => stem.length > 1 && isConsonant(stem, stem.length - 1)],
  ]);
}

function step2(word: string): string {
  if (word.endsWith("alli") && hasPositiveMeasure(replaceSuffix(word, "alli", ""))) {
    return step2(replaceSuffix(word, "alli", "al"));
  }
  const rules: Rule[] = [
    ["ational", "ate", hasPositiveMeasure],
    ["tional", "tion", hasPositiveMeasure],
    ["enci", "ence", hasPositiveMeasure],
    ["anci", "ance", hasPositiveMeasure],
    ["izer", "ize", hasPositiveMeasure],
    ["bli", "ble", hasPositiveMeasure],
    ["alli", "al", hasPositiveMeasure],
    ["entli", "ent", hasPositiveMeasure],
    ["eli", "e", hasPositiveMeasure],
    ["ousli", "ous", hasPositiveMeasure],
    ["ization", "ize", hasPositiveMeasure],
    ["ation", "ate", hasPositiveMeasure],
    ["ator", "ate", hasPositiveMeasure],
    ["alism", "al", hasPositiveMeasure],
    ["iveness", "ive", hasPositiveMeasure],
    ["fulness", "ful", hasPositiveMeasure],
    ["ousness", "ous", hasPositiveMeasure],
    ["aliti", "al", hasPositiveMeasure],
    ["iviti", "ive", hasPositiveMeasure],
    ["biliti", "ble", hasPositiveMeasure],
    ["fulli", "ful", hasPositiveMeasure],
    ["logi", "log", () => hasPositiveMeasure(word.slice(0, -3))],
  ];
  return applyRuleList(word, rules);
}

function step3(word: string): string {
  return applyRuleList(word, [
    ["icate", "ic", hasPositiveMeasure],
    ["ative", "", hasPositiveMeasure],
    ["alize", "al", hasPositiveMeasure],
    ["iciti", "ic", hasPositiveMeasure],
    ["ical", "ic", hasPositiveMeasure],
    ["ful", "", hasPositiveMeasure],
    ["ness", "", hasPositiveMeasure],
  ]);
}

function step4(word: string): string {
  const gt1 = (stem: string) => measure(stem) > 1;
  return applyRuleList(word, [
    ["al", "", gt1],
    ["ance", "", gt1],
    ["ence", "", gt1],
    ["er", "", gt1],
    ["ic", "", gt1],
    ["able", "", gt1],
    ["ible", "", gt1],
    ["ant", "", gt1],
    ["ement", "", gt1],
    ["ment", "", gt1],
    ["ent", "", gt1],
    ["ion", "", (stem) => measure(stem) > 1 && ["s", "t"].includes(stem[stem.length - 1])],
    ["ou", "", gt1],
    ["ism", "", gt1],
    ["ate", "", gt1],
    ["iti", "", gt1],
    ["ous", "", gt1],
    ["ive", "", gt1],
    ["ize", "", gt1],
  ]);
}

function step5a(word: string): string {
  if (word.endsWith("e")) {
    const stem = replaceSuffix(word, "e", "");
    if (measure(stem) > 1) return stem;
    if (measure(stem) === 1 && !endsCvc(stem)) return stem;
  }
  return word;
}

function step5b(word: string): string {
  return applyRuleList(word, [["ll", "l", () => measure(word.slice(0, -1)) > 1]]);
}

/** `PorterStemmer().stem(word)` from NLTK 3.8.1 (NLTK_EXTENSIONS mode). */
export function porterStem(word: string): string {
  let stem = word.toLowerCase();
  const pooled = POOL.get(word);
  if (pooled !== undefined) return POOL.get(stem) ?? pooled;
  if (word.length <= 2) return stem;
  stem = step1a(stem);
  stem = step1b(stem);
  stem = step1c(stem);
  stem = step2(stem);
  stem = step3(stem);
  stem = step4(stem);
  stem = step5a(stem);
  stem = step5b(stem);
  return stem;
}
