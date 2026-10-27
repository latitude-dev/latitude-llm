import { getProjectDetailsUseCase } from "@domain/admin"
import { type FilterSet, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  countTraceDeletionMatchesUseCase,
  createTraceDeletionRequestUseCase,
  TRACE_DELETION_MAX_TRACE_IDS,
  type TraceDeletionRequest,
  TraceDeletionRequestRepository,
} from "@domain/spans"
import { AIEmbedLive, withAi } from "@platform/ai"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AdminProjectRepositoryLive,
  OutboxEventWriterLive,
  TraceDeletionRequestRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient, getRedisClient } from "../../server/clients.ts"

export const TRACE_DELETION_CONFIRMATION = "delete traces"

const optionalText = z.string().trim().max(1000).optional()

/**
 * Exported for input-schema tests.
 */
export const adminTraceDeletionSelectorSchema = z
  .object({
    projectId: z.string().min(1).max(256),
    tag: optionalText,
    userId: optionalText,
    sessionId: optionalText,
    metadataKey: z
      .string()
      .trim()
      .max(200)
      .regex(/^[a-zA-Z0-9_.-]*$/)
      .optional(),
    metadataValue: optionalText,
    traceIds: z.array(z.string().trim().length(32)).max(TRACE_DELETION_MAX_TRACE_IDS).optional(),
  })
  .refine((selector) => Boolean(selector.metadataKey) === Boolean(selector.metadataValue), {
    message: "Fill both the metadata key and value, or neither",
    path: ["metadataValue"],
  })

export const adminCreateTraceDeletionInputSchema = adminTraceDeletionSelectorSchema.and(
  z.object({ confirmation: z.literal(TRACE_DELETION_CONFIRMATION) }),
)

type AdminTraceDeletionSelector = z.infer<typeof adminTraceDeletionSelectorSchema>

/** Exported for tests: staff fill simple fields, which select like the matching trace-list filters. */
export const toTraceDeletionFilters = (selector: AdminTraceDeletionSelector): FilterSet => {
  const filters: Record<string, FilterSet[string]> = {}
  if (selector.tag) filters.tags = [{ op: "contains", value: selector.tag }]
  if (selector.userId) filters.userId = [{ op: "eq", value: selector.userId }]
  if (selector.sessionId) filters.sessionId = [{ op: "eq", value: selector.sessionId }]
  if (selector.metadataKey && selector.metadataValue) {
    filters[`metadata.${selector.metadataKey}`] = [{ op: "eq", value: selector.metadataValue }]
  }
  return filters
}

export interface AdminTraceDeletionDto {
  readonly id: string
  readonly status: TraceDeletionRequest["status"]
  readonly filters: FilterSet
  readonly requestedBy: TraceDeletionRequest["requestedBy"]
  readonly matchedTraceCount: number
  readonly deletedRowCounts: Readonly<Record<string, number>>
  readonly error: string | null
  readonly createdAt: string
  readonly completedAt: string | null
}

const toDto = (request: TraceDeletionRequest): AdminTraceDeletionDto => ({
  id: request.id,
  status: request.status,
  filters: request.filters,
  requestedBy: request.requestedBy,
  matchedTraceCount: request.matchedTraceCount,
  deletedRowCounts: request.deletedRowCounts,
  error: request.error,
  createdAt: request.createdAt.toISOString(),
  completedAt: request.completedAt?.toISOString() ?? null,
})

/** The organization always comes from the project row, never from the client. */
const resolveTarget = (projectId: string) =>
  Effect.runPromise(
    getProjectDetailsUseCase({ projectId: ProjectId(projectId) }).pipe(
      withPostgres(AdminProjectRepositoryLive, getAdminPostgresClient()),
      Effect.map((project) => ({
        organizationId: OrganizationId(project.organization.id),
        projectId: ProjectId(project.id),
      })),
      withTracing,
    ),
  )

const toSelectorInput = (data: AdminTraceDeletionSelector) => ({
  filters: toTraceDeletionFilters(data),
  traceIds: (data.traceIds ?? []).map(TraceId),
})

export const adminPreviewTraceDeletion = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminTraceDeletionSelectorSchema)
  .handler(async ({ data }): Promise<{ matchedTraceCount: number }> => {
    const target = await resolveTarget(data.projectId)
    const matchedTraceCount = await Effect.runPromise(
      countTraceDeletionMatchesUseCase({ ...toSelectorInput(data), ...target }).pipe(
        withClickHouse(TraceRepositoryLive, getClickhouseClient(), target.organizationId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
    return { matchedTraceCount }
  })

/**
 * Dangerous backoffice operation: permanently deletes the selected traces of one
 * project and everything derived from them, on behalf of the project's organization.
 *
 * Guard: {@link adminMiddleware}. The deletion is recorded with the staff user as requester.
 */
export const adminCreateTraceDeletion = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminCreateTraceDeletionInputSchema)
  .handler(async ({ data, context }): Promise<AdminTraceDeletionDto> => {
    const target = await resolveTarget(data.projectId)
    const request = await Effect.runPromise(
      createTraceDeletionRequestUseCase({
        ...toSelectorInput(data),
        projectId: target.projectId,
        requestedBy: { type: "staff", id: context.adminUserId },
      }).pipe(
        withPostgres(
          Layer.mergeAll(TraceDeletionRequestRepositoryLive, OutboxEventWriterLive),
          getPostgresClient(),
          target.organizationId,
        ),
        withTracing,
      ),
    )
    return toDto(request)
  })

export const adminListTraceDeletions = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(z.object({ projectId: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<AdminTraceDeletionDto[]> => {
    const target = await resolveTarget(data.projectId)
    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const requests = yield* TraceDeletionRequestRepository
        return yield* requests.listByProjectId({ projectId: target.projectId, limit: 20 })
      }).pipe(
        withPostgres(TraceDeletionRequestRepositoryLive, getPostgresClient(), target.organizationId),
        withTracing,
      ),
    )
    return page.items.map(toDto)
  })
