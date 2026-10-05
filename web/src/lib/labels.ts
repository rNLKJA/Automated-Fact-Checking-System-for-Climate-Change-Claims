/** The four verdicts, in the notebook's `label_mapping` order (index = class id). */
export const LABELS = ["SUPPORTS", "REFUTES", "NOT_ENOUGH_INFO", "DISPUTED"] as const;

export type Label = (typeof LABELS)[number];

export function isLabel(x: unknown): x is Label {
  return typeof x === "string" && (LABELS as readonly string[]).includes(x);
}

export const LABEL_TEXT: Record<Label, { short: string; long: string; description: string }> = {
  SUPPORTS: {
    short: "Supports",
    long: "Supported",
    description: "The evidence backs the claim.",
  },
  REFUTES: {
    short: "Refutes",
    long: "Refuted",
    description: "The evidence contradicts the claim.",
  },
  NOT_ENOUGH_INFO: {
    short: "Not enough info",
    long: "Not enough information",
    description: "The evidence is related but does not settle the claim.",
  },
  DISPUTED: {
    short: "Disputed",
    long: "Disputed",
    description: "Some evidence supports the claim and some contradicts it.",
  },
};
