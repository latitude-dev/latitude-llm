import { submitApiAnnotationUseCase } from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
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
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import { AnnotationAnchorSchema, AnnotationSchema, toAnnotationResponse } from "../openapi/entities/annotation.ts"
import {
  jsonBody,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  TraceRefSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

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

const annotationsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "annotations",
    "x-fern-sdk-method-name": methodName,
  }) as const

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
    responses: openApiResponses({ status: 201, schema: AnnotationSchema, description: "Annotation created" }),
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

    return c.json(toAnnotationResponse(score), 201)
  },
})

export const createAnnotationsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  createAnnotation.mountHttp(app, createTierRateLimiter("low"))
  return app
}
