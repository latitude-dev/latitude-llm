import { submitApiAnnotationInputSchema, submitApiAnnotationUseCase } from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
import { type AnnotationScore, annotationScoreSchema } from "@domain/scores"
import { cuidSchema, FILTER_OPERATORS, traceIdSchema } from "@domain/shared"
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
import { jsonBody, openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// Filter sub-schemas are redefined locally (with the same semantics as
// `@domain/shared.filterConditionSchema`) so we can attach OpenAPI component
// names via `.openapi(...)`. Without named components, the Fern TypeScript
// generator inlines them and has trouble naming the anonymous array-item
// types, producing a broken `Item` reference. The constants `FILTER_OPERATORS`
// are imported from shared to keep both definitions in lockstep.
const FilterConditionSchema = z
  .object({
    op: z.enum(FILTER_OPERATORS),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  })
  .openapi("FilterCondition")

const FilterSetSchema = z.record(z.string(), z.array(FilterConditionSchema)).openapi("FilterSet")

const TraceRefSchema = z
  .discriminatedUnion("by", [
    z.object({ by: z.literal("id"), id: traceIdSchema }),
    z.object({ by: z.literal("filters"), filters: FilterSetSchema }),
  ])
  .openapi("TraceRef")

/**
 * POST body: caller-supplied annotation data plus a `trace` ref (id or filters)
 * and an optional `draft` flag (default `false` = published). `projectId` comes
 * from the URL and `sourceId` is forced to `"API"`.
 *
 * We rebuild the schema here (rather than chaining `.openapi()` on the domain
 * export) for two reasons:
 *   1. Zod-OpenAPI's prototype augmentation does not survive schemas returned
 *      from `.omit().extend(...)` across package boundaries — the fresh
 *      `z.object` wrapper is the idiomatic way to attach an OpenAPI name.
 *   2. The nested `trace.filters` field needs a named `FilterCondition`
 *      component (declared above) so SDK generators emit a clean `$ref`
 *      rather than a broken inline anonymous type.
 */
const RequestSchema = z
  .object({
    ...submitApiAnnotationInputSchema.shape,
    trace: TraceRefSchema,
  })
  .openapi("CreateAnnotationBody", {
    // Example mirrors the Latitude dogfood flow: resolve the upstream LLM
    // trace by the `metadata.scoreId` attribute the span carries (see PRD
    // "Identity strategy"), then write a published annotation into the
    // dogfood project. Also the canonical SDK usage for any caller who
    // doesn't have the raw OTel trace id at hand.
    example: {
      value: 1,
      passed: true,
      feedback: "Approved - the system annotator correctly flagged this as a refusal.",
      trace: {
        by: "filters",
        filters: {
          "metadata.scoreId": [{ op: "eq", value: "abc123def456ghi789jkl012" }],
        },
      },
    },
  })

const ResponseSchema = z
  .object({
    ...annotationScoreSchema.shape,
    id: cuidSchema,
    organizationId: cuidSchema,
    projectId: cuidSchema,
    draftedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("AnnotationScoreResponse")

const route = createRoute({
  method: "post",
  path: "/",
  operationId: "annotations.create",
  tags: ["Annotations"],
  summary: "Create project annotation",
  description:
    'Creates a human-reviewed annotation score. Published by default; pass `draft: true` to keep the annotation editable before publication. The target trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required).',
  security: PROTECTED_SECURITY,
  request: {
    params: ProjectParamsSchema,
    body: jsonBody(RequestSchema),
  },
  responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "Annotation created successfully" }),
})

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

export const createAnnotationsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()

  app.openapi(route, async (c) => {
    const body = c.req.valid("json")
    const { projectSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        const project = yield* projectRepository.findBySlug(projectSlug)

        return yield* submitApiAnnotationUseCase({
          ...body,
          projectId: project.id,
          organizationId,
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
  })

  return app
}
