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

const baseProviderErrorClassificationSchema = z.object({
  rawValue: z.string().min(1),
  normalizedValue: z.string().min(1),
})

export const providerErrorClassificationSchema = z.discriminatedUnion("classification", [
  baseProviderErrorClassificationSchema
    .extend({
      classification: z.literal("providerError"),
      kind: z.enum(["rateLimit", "overload", "serviceFailure", "providerRejection"]),
    })
    .strict(),
  baseProviderErrorClassificationSchema
    .extend({
      classification: z.literal("unmapped"),
    })
    .strict(),
])

export type ProviderErrorClassification = z.infer<typeof providerErrorClassificationSchema>
