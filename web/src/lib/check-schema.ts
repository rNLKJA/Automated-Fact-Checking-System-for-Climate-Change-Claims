import { z } from "zod";

/** Request body of `POST /api/check`. */
export const CheckRequest = z.object({
  claim: z
    .string()
    .trim()
    .min(3, "Type a claim of at least a few words.")
    .max(600, "Keep the claim under 600 characters (the model only reads 128 tokens anyway)."),
  rule: z.enum(["submission", "notebook"]).default("submission"),
});

export type CheckRequest = z.infer<typeof CheckRequest>;
