import {
  type FilterSet,
  filterSetSchema,
  generateId,
  type OrganizationId,
  organizationIdSchema,
  type ProjectId,
  projectIdSchema,
  type TraceDeletionRequestId,
  type TraceId,
  traceDeletionRequestIdSchema,
  unknownTraceFilterFields,
} from "@domain/shared"
import { z } from "zod"

export const TRACE_DELETION_STATUSES = ["pending", "running", "completed", "failed"] as const
export const traceDeletionStatusSchema = z.enum(TRACE_DELETION_STATUSES)
export type TraceDeletionStatus = z.infer<typeof traceDeletionStatusSchema>

export const TRACE_DELETION_REQUESTER_TYPES = ["user", "api_key", "staff"] as const
export const traceDeletionRequesterSchema = z.object({
  type: z.enum(TRACE_DELETION_REQUESTER_TYPES),
  id: z.string().min(1),
})
export type TraceDeletionRequester = z.infer<typeof traceDeletionRequesterSchema>

/** Explicit trace ids ride the `traceId` filter, whose `in` list caps how many one request can name. */
export const TRACE_DELETION_MAX_TRACE_IDS = 100

export const traceDeletionRequestSchema = z.object({
  id: traceDeletionRequestIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  filters: filterSetSchema,
  status: traceDeletionStatusSchema,
  requestedBy: traceDeletionRequesterSchema,
  matchedTraceCount: z.number().int().nonnegative(),
  deletedRowCounts: z.record(z.string(), z.number().int().nonnegative()),
  error: z.string().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type TraceDeletionRequest = z.infer<typeof traceDeletionRequestSchema>

export const createTraceDeletionRequest = (params: {
  readonly id?: TraceDeletionRequestId
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly filters: FilterSet
  readonly requestedBy: TraceDeletionRequester
}): TraceDeletionRequest => {
  const now = new Date()
  return traceDeletionRequestSchema.parse({
    id: params.id ?? generateId<"TraceDeletionRequestId">(),
    organizationId: params.organizationId,
    projectId: params.projectId,
    filters: params.filters,
    status: "pending",
    requestedBy: params.requestedBy,
    matchedTraceCount: 0,
    deletedRowCounts: {},
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  })
}

export const isTraceDeletionFinished = (request: TraceDeletionRequest): boolean =>
  request.status === "completed" || request.status === "failed"

export const markTraceDeletionRunning = (request: TraceDeletionRequest): TraceDeletionRequest => {
  const now = new Date()
  return { ...request, status: "running", startedAt: request.startedAt ?? now, updatedAt: now }
}

export const markTraceDeletionCompleted = (
  request: TraceDeletionRequest,
  result: { readonly matchedTraceCount: number; readonly deletedRowCounts: Readonly<Record<string, number>> },
): TraceDeletionRequest => {
  const now = new Date()
  return {
    ...request,
    status: "completed",
    matchedTraceCount: result.matchedTraceCount,
    deletedRowCounts: { ...result.deletedRowCounts },
    error: null,
    completedAt: now,
    updatedAt: now,
  }
}

export const markTraceDeletionFailed = (
  request: TraceDeletionRequest,
  result: {
    readonly error: string
    readonly matchedTraceCount: number
    readonly deletedRowCounts: Readonly<Record<string, number>>
  },
): TraceDeletionRequest => {
  const now = new Date()
  return {
    ...request,
    status: "failed",
    matchedTraceCount: result.matchedTraceCount,
    deletedRowCounts: { ...result.deletedRowCounts },
    error: result.error,
    completedAt: now,
    updatedAt: now,
  }
}

/**
 * Folds explicit trace ids into the filter set, so a request has a single
 * selector that resolves through the trace list's own read path.
 */
export const buildTraceDeletionFilters = (input: {
  readonly filters?: FilterSet | undefined
  readonly traceIds?: readonly TraceId[] | undefined
}): FilterSet => {
  const filters: Record<string, FilterSet[string]> = { ...(input.filters ?? {}) }
  const traceIds = [...new Set(input.traceIds ?? [])]
  if (traceIds.length > 0) {
    filters.traceId = [...(filters.traceId ?? []), { op: "in", value: traceIds }]
  }
  return filters
}

/** Why a selector cannot be used for deletion, or `null` when it can. */
export const traceDeletionFiltersProblem = (filters: FilterSet): string | null => {
  const parsed = filterSetSchema.safeParse(filters)
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid filters"

  const unknownFields = unknownTraceFilterFields(filters)
  if (unknownFields.length > 0) return `Unknown trace filter fields: ${unknownFields.join(", ")}`

  const conditions = Object.values(filters).flat()
  if (conditions.length === 0) return "A trace deletion needs at least one filter or trace id"
  if (conditions.some((condition) => condition.op === "gtePercentile")) {
    return "Percentile filters are relative to the data and cannot select traces for deletion"
  }
  return null
}

/** Restricts a selector to traces that started before the request was made. */
export const withTraceDeletionCutoff = (filters: FilterSet, cutoff: Date): FilterSet => ({
  ...filters,
  startTime: [...(filters.startTime ?? []), { op: "lte", value: cutoff.toISOString() }],
})
