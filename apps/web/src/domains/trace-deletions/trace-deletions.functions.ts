import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { type FilterSet, ForbiddenError, ProjectId, TraceId, traceFilterSetSchema } from "@domain/shared"
import {
  countTraceDeletionMatchesUseCase,
  createTraceDeletionRequestUseCase,
  type TraceDeletionRequest,
  TraceDeletionRequestRepository,
} from "@domain/spans"
import { AIEmbedLive, withAi } from "@platform/ai"
import { TraceRepositoryLive } from "@platform/db-clickhouse"
import {
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  TraceDeletionRequestRepositoryLive,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../../server/clients.ts"
import { requireScopedSession, type ScopedOrgId } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

export const TRACE_DELETION_CONFIRMATION = "delete traces"

// Both lists become a `traceId` filter condition, whose array values the filter contract caps.
const MAX_SELECTION_ROW_IDS = 100

const traceDeletionSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("selected"),
    rowIds: z
      .array(z.string().length(32))
      .min(1)
      .max(
        MAX_SELECTION_ROW_IDS,
        `Select at most ${MAX_SELECTION_ROW_IDS} traces, or select all and narrow with filters`,
      ),
  }),
  z.object({ mode: z.literal("all") }),
  z.object({
    mode: z.literal("allExcept"),
    rowIds: z
      .array(z.string().length(32))
      .max(MAX_SELECTION_ROW_IDS, `Unselect at most ${MAX_SELECTION_ROW_IDS} traces, or narrow the list with filters`),
  }),
])

/** Exported for input-schema tests. */
export const traceDeletionSelectorSchema = z
  .object({
    projectId: z.string().min(1).max(256),
    selection: traceDeletionSelectionSchema,
    filters: traceFilterSetSchema.optional(),
    hasSearchQuery: z.boolean().optional(),
  })
  .refine((input) => !(input.hasSearchQuery && input.selection.mode !== "selected"), {
    message: "A search can't select traces for deletion. Clear the search, or pick the traces to delete.",
  })

export const createTraceDeletionInputSchema = traceDeletionSelectorSchema.and(
  z.object({ includeDatasetRows: z.boolean().optional(), confirmation: z.literal(TRACE_DELETION_CONFIRMATION) }),
)

type TraceDeletionSelection = z.infer<typeof traceDeletionSelectionSchema>

/**
 * Exported for tests: maps a trace-list selection onto a deletion selector. Picked rows delete
 * exactly those traces; "select all" deletes what the list's filters match, minus excluded rows.
 */
export const toTraceDeletionSelector = (
  selection: TraceDeletionSelection,
  filters: FilterSet | undefined,
): { readonly filters?: FilterSet; readonly traceIds?: readonly TraceId[] } => {
  if (selection.mode === "selected") return { traceIds: selection.rowIds.map(TraceId) }
  const base = filters ?? {}
  if (selection.mode === "all" || selection.rowIds.length === 0) return { filters: base }
  return {
    filters: { ...base, traceId: [...(base.traceId ?? []), { op: "notIn", value: selection.rowIds }] },
  }
}

export interface TraceDeletionRecord {
  readonly id: string
  readonly status: TraceDeletionRequest["status"]
  readonly filters: FilterSet
  readonly includeDatasetRows: boolean
  readonly requestedBy: TraceDeletionRequest["requestedBy"]
  readonly matchedTraceCount: number
  readonly deletedRecordCount: number
  readonly error: string | null
  readonly createdAt: string
  readonly completedAt: string | null
}

const toRecord = (request: TraceDeletionRequest): TraceDeletionRecord => ({
  id: request.id,
  status: request.status,
  filters: request.filters,
  includeDatasetRows: request.includeDatasetRows,
  requestedBy: request.requestedBy,
  matchedTraceCount: request.matchedTraceCount,
  deletedRecordCount: Object.values(request.deletedRowCounts).reduce((total, rows) => total + rows, 0),
  error: request.error,
  createdAt: request.createdAt.toISOString(),
  completedAt: request.completedAt?.toISOString() ?? null,
})

const requireProject = (projectId: string, organizationId: ScopedOrgId) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const projects = yield* ProjectRepository
      return yield* projects.findById(projectId)
    }).pipe(withScopedPostgres(ProjectRepositoryLive, getPostgresClient(), organizationId), withTracing),
  )

export const previewTraceDeletion = createServerFn({ method: "POST" })
  .inputValidator(traceDeletionSelectorSchema)
  .handler(async ({ data, context }): Promise<{ matchedTraceCount: number }> => {
    const { organizationId } = await requireScopedSession(context)
    const project = await requireProject(data.projectId, organizationId)
    const matchedTraceCount = await Effect.runPromise(
      countTraceDeletionMatchesUseCase({
        ...toTraceDeletionSelector(data.selection, data.filters),
        organizationId,
        projectId: ProjectId(project.id),
      }).pipe(
        withScopedClickHouse(TraceRepositoryLive, getClickhouseClient(), organizationId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
    )
    return { matchedTraceCount }
  })

/** Permanently deletes the selected traces. Only organization owners and admins may request it. */
export const createTraceDeletion = createServerFn({ method: "POST" })
  .inputValidator(createTraceDeletionInputSchema)
  .handler(async ({ data, context }): Promise<TraceDeletionRecord> => {
    const { organizationId, userId } = await requireScopedSession(context)
    const project = await requireProject(data.projectId, organizationId)
    const request = await Effect.runPromise(
      Effect.gen(function* () {
        const memberships = yield* MembershipRepository
        if (!(yield* memberships.isAdmin(organizationId, userId))) {
          return yield* new ForbiddenError({ message: "Only organization owners and admins can delete traces" })
        }
        return yield* createTraceDeletionRequestUseCase({
          ...toTraceDeletionSelector(data.selection, data.filters),
          projectId: ProjectId(project.id),
          includeDatasetRows: data.includeDatasetRows === true,
          requestedBy: { type: "user", id: userId },
        })
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(MembershipRepositoryLive, TraceDeletionRequestRepositoryLive, OutboxEventWriterLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )
    return toRecord(request)
  })

export const listTraceDeletions = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string().min(1).max(256) }))
  .handler(async ({ data, context }): Promise<TraceDeletionRecord[]> => {
    const { organizationId } = await requireScopedSession(context)
    const project = await requireProject(data.projectId, organizationId)
    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const requests = yield* TraceDeletionRequestRepository
        return yield* requests.listByProjectId({ projectId: ProjectId(project.id), limit: 50 })
      }).pipe(withScopedPostgres(TraceDeletionRequestRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )
    return page.items.map(toRecord)
  })
