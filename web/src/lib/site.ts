export const SITE = {
  name: "Climate Claim Checker",
  tagline: "A 2024 student fact-checking system for climate claims, rebuilt and re-run",
  /** the production site (documents link here so the links also work on GitHub) */
  url: "https://comp90042-climate-fact-check.vercel.app",
  repo: "https://github.com/rNLKJA/Automated-Fact-Checking-System-for-Climate-Change-Claims",
  courseRepo: "https://github.com/drcarenhan/COMP90042_2024",
  subject: { code: "COMP90042", name: "Natural Language Processing" },
  university: "The University of Melbourne",
  term: "2024, Semester 1",
  group: "Wed5PM Group 1",
} as const;

export const TEAM = [
  {
    name: "Sunchuangyu (Rin) Huang",
    role: "System design, preprocessing, TF-IDF evidence retrieval, report and presentation",
  },
  {
    name: "Wei Zhao",
    role: "Transformer and LSTM classifiers: design, training, evaluation and model selection",
  },
  {
    name: "Xuan Wang",
    role: "Retrieval testing and debugging, literature review, report and presentation",
  },
] as const;

export const NAV = [
  { href: "/try", label: "Try a claim" },
  { href: "/explore", label: "Explore" },
  { href: "/results", label: "Results" },
  { href: "/evaluation", label: "LLM eval" },
  { href: "/method", label: "Pipeline" },
  { href: "/methods", label: "Methods" },
] as const;
