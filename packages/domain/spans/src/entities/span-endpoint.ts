import { z } from "zod"

const baseFinishReasonClassificationSchema = z.object({
  rawValue: z.string(),
  normalizedValue: z.string(),
})

export const finishReasonClassificationSchema = z.discriminatedUnion("classification", [
  baseFinishReasonClassificationSchema
    .extend({
      classification: z.literal("clean"),
      kind: z.enum(["normal", "callerStop", "toolContinuation", "refusal"]),
    })
    .strict(),
  baseFinishReasonClassificationSchema
    .extend({
      classification: z.literal("unreliable"),
      kind: z.enum(["length", "contentFilter", "guardrail", "malformedFunctionCall", "generationError"]),
      requiresOutputDamage: z.boolean(),
    })
    .strict(),
  baseFinishReasonClassificationSchema
    .extend({
      classification: z.literal("unmapped"),
    })
    .strict(),
])

export type FinishReasonClassification = z.infer<typeof finishReasonClassificationSchema>
