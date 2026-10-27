import { ProjectRepository } from "@domain/projects"
import { NotFoundError, OrganizationId, TraceDeletionRequestId, TraceId } from "@domain/shared"
import {
  countTraceDeletionMatchesUseCase,
  createTraceDeletionRequestUseCase,
  TRACE_DELETION_MAX_TRACE_IDS,
  type TraceDeletionRequester,
  TraceDeletionRequestRepository,
  type TraceDeletionSelectorInput,
} from "@domain/spans"
import { createRoute, z } from "@hono/zod-openapi"
import { AIEmbedLive, withAi } from "@platform/ai"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  TraceDeletionRequestRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { TraceDeletionSchema, toTraceDeletionResponse } from "../openapi/entities/trace-deletion.ts"
import {
  jsonBody,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  TracesRefSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { AuthContext, OrganizationScopedEnv } from "../types.ts"

const traceDeletionsPath = "/projects/:projectSlug/trace-deletions"

const traceDeletionEndpoint = defineOperation<OrganizationScopedEnv>(traceDeletionsPath)

const TRACES_DESCRIPTION = `Which traces to delete: up to ${TRACE_DELETION_MAX_TRACE_IDS} explicit trace ids, or a trace filter set (for example every trace tagged \`customer:acme\`, or every trace of one \`userId\`). A filter must contain at least one condition, and percentile conditions are not accepted. Only traces that started before the deletion is requested are deleted.`

const CreateTraceDeletionBodySchema = z
  .object({
    traces: TracesRefSchema.describe(TRACES_DESCRIPTION),
    includeDatasetRows: z
      .boolean()
      .optional()
      .describe(
        "Also delete dataset rows that were copied from the deleted traces, in every dataset of the organization, including their earlier versions. Defaults to `false`, which keeps dataset rows. Ignored by `previewTraceDeletion`.",
      ),
  })
  .openapi("CreateTraceDeletionBody")

const PreviewTraceDeletionResponseSchema = z
  .object({
    matchedTraceCount: z
      .number()
      .int()
      .describe("How many traces a deletion with this selector would delete if it were requested now."),
  })
  .openapi("PreviewTraceDeletionResponse")

const ListTraceDeletionsQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size. Defaults to 20; max 100."),
})

const ListTraceDeletionsResponseSchema = z
  .object({
    items: z.array(TraceDeletionSchema).describe("The project's trace deletions, newest first."),
    nextCursor: z.string().nullable().describe("Opaque cursor for the next page. `null` when there are no more pages."),
  })
  .openapi("ListTraceDeletionsResponse")

const TraceDeletionIdParamsSchema = ProjectParamsSchema.extend({
  deletionId: z.string().describe("Trace deletion id, as returned by `createTraceDeletion`."),
})

const toSelector = (traces: z.infer<typeof TracesRefSchema>): TraceDeletionSelectorInput =>
  traces.by === "ids" ? { traceIds: traces.ids.map(TraceId) } : { filters: traces.filters }

const toRequester = (auth: AuthContext): TraceDeletionRequester =>
  auth.method === "api-key"
    ? { type: "api_key", id: auth.userId.replace(/^api-key:/, "") }
    : { type: "user", id: auth.userId }

const createTraceDeletion = traceDeletionEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createTraceDeletion",
    tags: ["Trace deletions"],
    group: "traceDeletions",
    sdkMethod: "create",
    summary: "Delete traces (async)",
    description:
      "Permanently deletes the traces selected by `traces`, together with everything derived from them: their spans, scores and annotations, search indexes, and the analyses of the sessions they belong to. The deletion runs in the background; poll it with `getTraceDeletion` until `status` is `completed`. Deletion cannot be undone. Use `previewTraceDeletion` first to see how many traces a selector matches.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateTraceDeletionBodySchema) },
    responses: typedResponses({ status: 202, schema: TraceDeletionSchema, description: "Trace deletion requested" }),
  }),
  access: "destructive",
  rateLimitTier: "ultra",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const request = yield* createTraceDeletionRequestUseCase({
        ...toSelector(input.body.traces),
        projectId: project.id,
        includeDatasetRows: input.body.includeDatasetRows === true,
        requestedBy: toRequester(ctx.auth),
      })
      return { status: 202, body: toTraceDeletionResponse(request) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, TraceDeletionRequestRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const previewTraceDeletion = traceDeletionEndpoint({
  route: createRoute({
    method: "post",
    path: "/preview",
    name: "previewTraceDeletion",
    tags: ["Trace deletions"],
    group: "traceDeletions",
    sdkMethod: "preview",
    summary: "Preview trace deletion",
    description:
      "Counts the traces a deletion with this selector would delete, without deleting anything. Accepts the same `traces` selector as `createTraceDeletion`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateTraceDeletionBodySchema) },
    responses: typedResponses({
      status: 200,
      schema: PreviewTraceDeletionResponseSchema,
      description: "Number of matching traces",
    }),
  }),
  access: "read-only",
  rateLimitTier: "high",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const matchedTraceCount = yield* countTraceDeletionMatchesUseCase({
        ...toSelector(input.body.traces),
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: project.id,
      })
      return { status: 200, body: { matchedTraceCount } } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(TraceRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withAi(AIEmbedLive, ctx.redis),
      withTracing,
    ),
})

const listTraceDeletions = traceDeletionEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listTraceDeletions",
    tags: ["Trace deletions"],
    group: "traceDeletions",
    sdkMethod: "list",
    summary: "List trace deletions",
    description:
      "Returns the project's trace deletions, newest first. Each one records what was selected, who requested it, and how much was deleted, so it can serve as evidence of erasure.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListTraceDeletionsQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: ListTraceDeletionsResponseSchema,
      description: "Page of trace deletions",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const requests = yield* TraceDeletionRequestRepository
      const page = yield* requests.listByProjectId({
        projectId: project.id,
        limit: input.query.limit,
        cursor: input.query.cursor,
      })
      return {
        status: 200,
        body: { items: page.items.map(toTraceDeletionResponse), nextCursor: page.nextCursor },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, TraceDeletionRequestRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const getTraceDeletion = traceDeletionEndpoint({
  route: createRoute({
    method: "get",
    path: "/{deletionId}",
    name: "getTraceDeletion",
    tags: ["Trace deletions"],
    group: "traceDeletions",
    sdkMethod: "get",
    summary: "Get trace deletion",
    description: "Returns one trace deletion, including its status and how much it has deleted so far.",
    security: PROTECTED_SECURITY,
    request: { params: TraceDeletionIdParamsSchema },
    responses: typedResponses({ status: 200, schema: TraceDeletionSchema, description: "Trace deletion" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const requests = yield* TraceDeletionRequestRepository
      const request = yield* requests.findById(TraceDeletionRequestId(input.params.deletionId))
      if (request.projectId !== project.id) {
        return yield* new NotFoundError({ entity: "TraceDeletionRequest", id: input.params.deletionId })
      }
      return { status: 200, body: toTraceDeletionResponse(request) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, TraceDeletionRequestRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

export const traceDeletionsModule: OperationModule = {
  path: traceDeletionsPath,
  operations: [createTraceDeletion, previewTraceDeletion, listTraceDeletions, getTraceDeletion],
}
