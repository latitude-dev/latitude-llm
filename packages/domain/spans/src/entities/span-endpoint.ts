import { spanIdSchema, traceIdSchema } from "@domain/shared"
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

export const recognizedProviderErrorClassificationSchema = baseProviderErrorClassificationSchema
  .extend({
    classification: z.literal("providerError"),
    kind: z.enum(["rateLimit", "overload", "serviceFailure", "providerRejection"]),
  })
  .strict()

export const providerErrorClassificationSchema = z.discriminatedUnion("classification", [
  recognizedProviderErrorClassificationSchema,
  baseProviderErrorClassificationSchema
    .extend({
      classification: z.literal("unmapped"),
    })
    .strict(),
])

export type ProviderErrorClassification = z.infer<typeof providerErrorClassificationSchema>
export type RecognizedProviderErrorClassification = z.infer<typeof recognizedProviderErrorClassificationSchema>

export const spanEndpointClassificationSchema = z
  .object({
    finishReasons: z.array(finishReasonClassificationSchema).readonly(),
    providerError: providerErrorClassificationSchema.nullable(),
  })
  .strict()

export type SpanEndpointClassification = z.infer<typeof spanEndpointClassificationSchema>

export const generationPositionSchema = z.enum(["final", "intermediate"])
export type GenerationPosition = z.infer<typeof generationPositionSchema>

export const sessionGenerationEndpointSchema = z
  .object({
    traceId: traceIdSchema,
    spanId: spanIdSchema,
    spanIndex: z.number().int().nonnegative(),
    generationIndex: z.number().int().nonnegative(),
    generationPosition: generationPositionSchema,
    startTime: z.date(),
    endTime: z.date(),
    provider: z.string(),
    model: z.string(),
    finishReasons: z.array(finishReasonClassificationSchema).readonly(),
    providerError: providerErrorClassificationSchema.nullable(),
  })
  .strict()

export type SessionGenerationEndpoint = z.infer<typeof sessionGenerationEndpointSchema>

const baseProviderErrorFindingSchema = z.object({
  traceId: traceIdSchema,
  spanId: spanIdSchema,
  generationPosition: generationPositionSchema,
  provider: z.string(),
  model: z.string(),
  error: recognizedProviderErrorClassificationSchema,
  failedSpanIndex: z.number().int().nonnegative(),
  costTotalMicrocents: z.number().nonnegative(),
  observedDurationNs: z.number().nonnegative(),
})

export const providerErrorFindingSchema = z.union([
  baseProviderErrorFindingSchema
    .extend({
      recovered: z.literal(true),
      sameSubjectRecovered: z.literal(true),
      terminal: z.literal(false),
      successfulSpanIndex: z.number().int().nonnegative(),
      sameSubjectSuccessfulSpanIndex: z.number().int().nonnegative(),
    })
    .strict(),
  baseProviderErrorFindingSchema
    .extend({
      recovered: z.literal(true),
      sameSubjectRecovered: z.literal(false),
      terminal: z.literal(false),
      successfulSpanIndex: z.number().int().nonnegative(),
    })
    .strict(),
  baseProviderErrorFindingSchema
    .extend({
      recovered: z.literal(false),
      sameSubjectRecovered: z.literal(true),
      terminal: z.literal(true),
      successfulSpanIndex: z.number().int().nonnegative(),
      sameSubjectSuccessfulSpanIndex: z.number().int().nonnegative(),
    })
    .strict(),
  baseProviderErrorFindingSchema
    .extend({
      recovered: z.literal(false),
      sameSubjectRecovered: z.literal(false),
      terminal: z.literal(true),
      successfulSpanIndex: z.number().int().nonnegative().optional(),
    })
    .strict(),
])

export type ProviderErrorFinding = z.infer<typeof providerErrorFindingSchema>

export const sessionSpanEndpointResolutionSchema = z
  .object({
    generationEndpoints: z.array(sessionGenerationEndpointSchema).readonly(),
    providerErrorFindings: z.array(providerErrorFindingSchema).readonly(),
  })
  .strict()

export type SessionSpanEndpointResolution = z.infer<typeof sessionSpanEndpointResolutionSchema>
