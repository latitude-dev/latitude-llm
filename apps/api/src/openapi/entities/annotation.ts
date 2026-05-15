import {
  ANNOTATION_ANCHOR_TEXT_FORMATS,
  ANNOTATION_SCORE_PARTIAL_SOURCE_IDS,
  type AnnotationScore,
} from "@domain/scores"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { sessionIdSchema, spanIdSchema, traceIdSchema } from "../schemas.ts"

// Anchor pins an annotation to a position inside a trace. Shape mirrors
// `annotationAnchorSchema` from `@domain/scores` field-for-field; redeclared
// here so every property carries a description for the SDK + MCP surfaces
// (the domain schema is description-free by design).
const annotationAnchorFields = {
  messageIndex: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("0-based message index inside the conversation. Omit for conversation-level annotations."),
  partIndex: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("0-based index into the target message's `parts[]`. Requires `messageIndex`."),
  startOffset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Inclusive start offset for substring annotations. Must be paired with `endOffset` and `partIndex`."),
  endOffset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Exclusive end offset for substring annotations. Must be paired with `startOffset` and `partIndex`, and `>= startOffset`.",
    ),
  textFormat: z
    .enum(ANNOTATION_ANCHOR_TEXT_FORMATS)
    .optional()
    .describe(
      'UI-side text transform applied before the offsets were captured (e.g. `"pretty-json"`). Resolvers must apply the same transform before slicing.',
    ),
} as const

export const AnnotationAnchorSchema = z.object(annotationAnchorFields).openapi("AnnotationAnchor")

const AnnotationMetadataSchema = z
  .object({
    rawFeedback: z
      .string()
      .describe("Original feedback text as written by the annotator, before any server-side enrichment."),
    ...annotationAnchorFields,
  })
  .openapi("AnnotationMetadata")

export const AnnotationSchema = z
  .object({
    id: cuidSchema.describe("Stable annotation identifier."),
    organizationId: cuidSchema.describe("Organization that owns this annotation."),
    projectId: cuidSchema.describe("Project this annotation lives in."),
    sessionId: sessionIdSchema
      .nullable()
      .describe("Session id lifted from the annotated trace. `null` when the trace has no session."),
    traceId: traceIdSchema.nullable().describe("Identifier of the annotated trace."),
    spanId: spanIdSchema
      .nullable()
      .describe("Span the annotation pins to. Defaults to the trace's last LLM-completion span."),
    simulationId: cuidSchema.nullable().describe("Simulation reference, if any."),
    issueId: cuidSchema.nullable().describe("Issue this annotation contributes to, if any."),
    value: z.number().min(0).max(1).describe("Normalized score value in [0, 1]. Higher = better."),
    passed: z.boolean().describe("Whether the annotation marks the output as passing."),
    feedback: z.string().describe("Free-text feedback explaining the score."),
    error: z
      .string()
      .min(1)
      .nullable()
      .describe("Generation error text, when the annotation itself errored. `null` for successful annotations."),
    errored: z.boolean().describe("`true` when the annotation could not be generated successfully."),
    duration: z.number().int().nonnegative().describe("Generation duration in nanoseconds. `0` for human annotations."),
    tokens: z
      .number()
      .int()
      .nonnegative()
      .describe("Total LLM tokens consumed generating the score. `0` for human annotations."),
    cost: z
      .number()
      .int()
      .nonnegative()
      .describe("Total LLM cost in microcents (1/1,000,000 USD). `0` for human annotations."),
    draftedAt: z.iso
      .datetime()
      .nullable()
      .describe("ISO-8601 timestamp at which the annotation was drafted. `null` for published annotations."),
    annotatorId: cuidSchema
      .nullable()
      .describe("User who authored the annotation. `null` when not attributed to a user."),
    createdAt: z.iso.datetime().describe("ISO-8601 timestamp at which the annotation was created."),
    updatedAt: z.iso.datetime().describe("ISO-8601 timestamp of the last metadata update."),
    source: z.literal("annotation").describe('Always `"annotation"` for this shape.'),
    sourceId: z
      .union([z.enum(ANNOTATION_SCORE_PARTIAL_SOURCE_IDS), cuidSchema])
      .describe(
        'Origin marker. Sentinel `"UI"` / `"API"` / `"SYSTEM"` for drafts and automation, or an annotation-queue CUID for queue-authored rows.',
      ),
    metadata: AnnotationMetadataSchema.describe(
      "Annotation-specific metadata: `rawFeedback` plus a snapshot of the anchor at write time.",
    ),
  })
  .openapi("Annotation")

export const toAnnotationResponse = (score: AnnotationScore) => ({
  id: score.id as string,
  organizationId: score.organizationId,
  projectId: score.projectId,
  sessionId: score.sessionId,
  traceId: score.traceId,
  spanId: score.spanId,
  source: score.source,
  sourceId: score.sourceId,
  simulationId: score.simulationId,
  issueId: score.issueId,
  annotatorId: score.annotatorId,
  value: score.value,
  passed: score.passed,
  feedback: score.feedback,
  metadata: score.metadata,
  error: score.error,
  errored: score.errored,
  duration: score.duration,
  tokens: score.tokens,
  cost: score.cost,
  draftedAt: score.draftedAt ? score.draftedAt.toISOString() : null,
  createdAt: score.createdAt.toISOString(),
  updatedAt: score.updatedAt.toISOString(),
})
