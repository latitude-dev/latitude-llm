import {
  deleteApiAnnotationUseCase,
  getApiAnnotationUseCase,
  submitApiAnnotationUseCase,
  updateApiAnnotationUseCase,
} from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
import { cuidSchema, UserId } from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import { AIEmbedLive, withAi } from "@platform/ai"
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
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { AnnotationAnchorSchema, AnnotationSchema, toAnnotationResponse } from "../openapi/entities/annotation.ts"
import {
  jsonBody,
  openApiNoContentResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  TraceRefSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const RequestSchema = z
  .object({
    simulationId: cuidSchema
      .nullable()
      .default(null)
      .describe("Simulation this annotation is tied to, if any. `null` (default) when not part of a simulation."),
    signalId: cuidSchema
      .nullable()
      .default(null)
      .describe(
        "Pre-selected signal this annotation belongs to. Leave `null` (default) to let the automatic signal-discovery pipeline route the annotation.",
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

const UpdateAnnotationBodySchema = z
  .object({
    value: z.number().min(0).max(1).optional().describe("New normalized score value in [0, 1]."),
    passed: z.boolean().optional().describe("New pass or fail verdict."),
    feedback: z.string().min(1).optional().describe("New free-text feedback explaining the score."),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  })
  .openapi("UpdateAnnotationBody")

const annotationsPath = "/projects/:projectSlug/annotations"

const annotationEndpoint = defineOperation<OrganizationScopedEnv>(annotationsPath)

const AnnotationParamsSchema = ProjectParamsSchema.extend({
  annotationId: cuidSchema.describe(
    "Latitude-generated annotation identifier returned when the annotation was created.",
  ),
})

const createAnnotation = annotationEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createAnnotation",
    tags: ["Annotations"],
    group: "annotations",
    sdkMethod: "create",
    summary: "Create project annotation",
    description:
      'Creates a published annotation score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required). When called with an OAuth token, the annotation is attributed to the authenticated user.',
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(RequestSchema),
    },
    responses: typedResponses({ status: 201, schema: AnnotationSchema, description: "Annotation created" }),
  }),
  access: "write",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const body = input.body
      const { projectSlug } = input.params
      const annotatorId = ctx.auth.method === "oauth" ? UserId(ctx.auth.userId as string) : null

      const projectRepository = yield* ProjectRepository
      const project = yield* projectRepository.findBySlug(projectSlug)

      const score = yield* submitApiAnnotationUseCase({
        ...body,
        projectId: project.id,
        organizationId: ctx.organization.id,
        annotatorId,
      })
      return { status: 201, body: toAnnotationResponse(score) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(
        Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive, SpanRepositoryLive),
        ctx.clickhouse,
        ctx.organization.id,
      ),
      withAi(AIEmbedLive, ctx.redis),
      Effect.provide(QueuePublisherLive(ctx.queuePublisher)),
      withTracing,
    ),
})

const getAnnotation = annotationEndpoint({
  route: createRoute({
    method: "get",
    path: "/{annotationId}",
    name: "getAnnotation",
    tags: ["Annotations"],
    group: "annotations",
    sdkMethod: "get",
    summary: "Get API annotation",
    description: "Returns an API-created annotation by its Latitude-generated identifier.",
    security: PROTECTED_SECURITY,
    request: { params: AnnotationParamsSchema },
    responses: typedResponses({ status: 200, schema: AnnotationSchema, description: "Annotation" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepository = yield* ProjectRepository
      const project = yield* projectRepository.findBySlug(input.params.projectSlug)
      const score = yield* getApiAnnotationUseCase({
        projectId: project.id,
        annotationId: input.params.annotationId,
      })
      return { status: 200, body: toAnnotationResponse(score) } as const
    }).pipe(
      withPostgres(Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive), ctx.postgresClient, ctx.organization.id),
      withTracing,
    ),
})

const updateAnnotation = annotationEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{annotationId}",
    name: "updateAnnotation",
    tags: ["Annotations"],
    group: "annotations",
    sdkMethod: "update",
    summary: "Update API annotation",
    description:
      "Updates an API-created annotation while retaining its Latitude-generated identifier. Omitted fields keep their current values.",
    security: PROTECTED_SECURITY,
    request: {
      params: AnnotationParamsSchema,
      body: jsonBody(UpdateAnnotationBodySchema),
    },
    responses: typedResponses({ status: 200, schema: AnnotationSchema, description: "Updated annotation" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepository = yield* ProjectRepository
      const project = yield* projectRepository.findBySlug(input.params.projectSlug)
      const score = yield* updateApiAnnotationUseCase({
        projectId: project.id,
        annotationId: input.params.annotationId,
        ...input.body,
      })
      return { status: 200, body: toAnnotationResponse(score) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(ScoreAnalyticsRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const deleteAnnotation = annotationEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{annotationId}",
    name: "deleteAnnotation",
    tags: ["Annotations"],
    group: "annotations",
    sdkMethod: "delete",
    summary: "Delete API annotation",
    description: "Deletes an API-created annotation by its Latitude-generated identifier.",
    security: PROTECTED_SECURITY,
    request: { params: AnnotationParamsSchema },
    responses: openApiNoContentResponses({ description: "Annotation deleted" }),
  }),
  access: "destructive",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepository = yield* ProjectRepository
      const project = yield* projectRepository.findBySlug(input.params.projectSlug)
      yield* deleteApiAnnotationUseCase({
        projectId: project.id,
        annotationId: input.params.annotationId,
      })
      return { status: 204 } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

export const annotationsModule: OperationModule = {
  path: annotationsPath,
  operations: [createAnnotation, getAnnotation, updateAnnotation, deleteAnnotation],
}
