import { submitApiAnnotationUseCase } from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
import {
  ANNOTATION_ANCHOR_TEXT_FORMATS,
  ANNOTATION_SCORE_PARTIAL_SOURCE_IDS,
  type AnnotationScore,
} from "@domain/scores"
import { cuidSchema, UserId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ProjectRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import {
  jsonBody,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  sessionIdSchema,
  spanIdSchema,
  TraceRefSchema,
  traceIdSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// Anchor pins an annotation to a position inside a trace. Shape mirrors
// `annotationAnchorSchema` from `@domain/scores` field-for-field; redeclared
// here so every property carries a description for the SDK + MCP surfaces
// (the domain schema is description-free by design).
//
// The fields are exposed as a plain object so `AnnotationMetadataSchema` can
// spread them alongside `rawFeedback` — server-persisted annotation metadata
// is the original anchor snapshotted, so the same field shapes apply.
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

const AnnotationAnchorSchema = z.object(annotationAnchorFields).openapi("AnnotationAnchor")

// `trace` uses the named `TraceRefSchema` so the OpenAPI emitter sees a single
// component — the un-named domain version inlines the discriminated union and
// trips a Fern name-mangling bug. See `../openapi/schemas.ts` for details.
const RequestSchema = z
  .object({
    simulationId: cuidSchema
      .nullable()
      .default(null)
      .describe("Simulation this annotation is tied to, if any. `null` (default) when not part of a simulation."),
    issueId: cuidSchema
      .nullable()
      .default(null)
      .describe(
        "Pre-selected issue this annotation belongs to. Leave `null` (default) to let the automatic issue-discovery pipeline route the annotation.",
      ),
    value: z.number().min(0).max(1).describe("Normalized score value in [0, 1]. Higher = better."),
    passed: z.boolean().describe("Whether the annotated output passes the reviewer's bar."),
    feedback: z.string().min(1).describe("Free-text feedback explaining the score. Surfaced alongside the trace."),
    anchor: AnnotationAnchorSchema.optional().describe(
      "Optional anchor pinning the annotation to a specific message / part / offset range inside the trace.",
    ),
    trace: TraceRefSchema.describe("Target trace. Either an explicit id or a filter set matching exactly one trace."),
  })
  .openapi("CreateAnnotationBody")

// Metadata persisted alongside annotation scores. `rawFeedback` plus the
// anchor fields snapshotted at write time — server-side resolvers re-derive
// the targeted message / part / offset range from this exact shape.
const AnnotationMetadataSchema = z
  .object({
    rawFeedback: z
      .string()
      .describe(
        "Original feedback text before enrichment. Human-authored for human annotations, model-authored for system drafts.",
      ),
    ...annotationAnchorFields,
  })
  .openapi("AnnotationScoreMetadata")

// Transformed branded-ID schemas from the domain (`sessionIdSchema`,
// `traceIdSchema`, `spanIdSchema`, etc.) can't be serialized to JSON Schema —
// `z.toJSONSchema` throws on `.transform()` nodes. We re-shape the response
// here field-for-field so every property carries a description and every
// branded ID is exposed as a plain string.
const ResponseSchema = z
  .object({
    id: cuidSchema.describe("Stable annotation-score identifier."),
    organizationId: cuidSchema.describe("Organization that owns this annotation."),
    projectId: cuidSchema.describe("Project this annotation lives in."),
    sessionId: sessionIdSchema
      .nullable()
      .describe("Session id lifted from the trace, when set. `null` when the trace has no session."),
    traceId: traceIdSchema.nullable().describe("Identifier of the annotated trace."),
    spanId: spanIdSchema
      .nullable()
      .describe("Span the annotation pins to. Defaults to the trace's last LLM-completion span."),
    simulationId: cuidSchema.nullable().describe("Simulation reference, if any."),
    issueId: cuidSchema.nullable().describe("Issue this annotation contributes to, if any."),
    value: z.number().min(0).max(1).describe("Normalized score value in [0, 1]."),
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
      .describe("Total LLM tokens consumed generating the score, if any. `0` for human annotations."),
    cost: z
      .number()
      .int()
      .nonnegative()
      .describe("Total LLM cost in microcents (1/1,000,000 of a USD). `0` for human annotations."),
    draftedAt: z.iso
      .datetime()
      .nullable()
      .describe("Always `null` for public-API annotations — they're written as published."),
    annotatorId: cuidSchema
      .nullable()
      .describe(
        "User who authored the annotation. `null` for API-key callers (organization-scoped); set to the authenticated user for OAuth callers.",
      ),
    createdAt: z.iso.datetime().describe("ISO-8601 timestamp at which the annotation was created."),
    updatedAt: z.iso.datetime().describe("ISO-8601 timestamp of the last metadata update."),
    source: z.literal("annotation").describe('Always `"annotation"` for this endpoint\'s responses.'),
    sourceId: z
      .union([z.enum(ANNOTATION_SCORE_PARTIAL_SOURCE_IDS), cuidSchema])
      .describe(
        'Origin marker. Sentinel `"UI"` / `"API"` / `"SYSTEM"` for drafts and automation, or an annotation-queue CUID for queue-authored rows. Public-API annotations are always `"API"`.',
      ),
    metadata: AnnotationMetadataSchema.describe(
      "Annotation-specific metadata: `rawFeedback` plus a snapshot of the anchor at write time.",
    ),
  })
  .openapi("AnnotationScoreResponse")

const annotationsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "annotations",
    "x-fern-sdk-method-name": methodName,
  }) as const

const toResponse = (score: AnnotationScore) => ({
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

export const annotationsPath = "/projects/:projectSlug/annotations"

const annotationEndpoint = defineApiEndpoint<OrganizationScopedEnv>(annotationsPath)

const createAnnotation = annotationEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createAnnotation",
    tags: ["Annotations"],
    ...annotationsFernGroup("create"),
    summary: "Create project annotation",
    description:
      'Creates a published annotation score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required). When called with an OAuth token, the annotation is attributed to the authenticated user.',
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(RequestSchema),
    },
    responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "Annotation created" }),
  }),
  handler: async (c) => {
    const body = c.req.valid("json")
    const { projectSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id
    const annotatorId = c.var.auth?.method === "oauth" ? UserId(c.var.auth.userId as string) : null

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        const project = yield* projectRepository.findBySlug(projectSlug)

        return yield* submitApiAnnotationUseCase({
          ...body,
          projectId: project.id,
          organizationId,
          annotatorId,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive, SpanRepositoryLive),
          c.var.clickhouse,
          organizationId,
        ),
        withAi(AIEmbedLive, c.var.redis),
        Effect.provide(QueuePublisherLive(c.var.queuePublisher)),
        withTracing,
      ),
    )

    return c.json(toResponse(score), 201)
  },
})

export const createAnnotationsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  createAnnotation.mountHttp(app)
  return app
}
