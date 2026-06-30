import type { RepositoryError, SqlClient } from "@domain/shared"
import { cuidSchema, OrganizationId, ProjectId, signalIdSchema } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { deriveSignalLifecycleStates } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import type { SignalListItem } from "./list-signals-types.ts"
import {
  type AnalyticsCandidate,
  makeZeroWindowMetric,
  matchesAssigneeFilter,
  matchesLifecycleGroup,
  signalsListFiltersSchema,
  toLightListItem,
  toScoreAnalyticsTimeRange,
} from "./signals-list-internals.ts"

export {
  type SignalAssigneeFilter,
  type SignalListAnalytics,
  type SignalListAnalyticsCounts,
  type SignalListItem,
  type SignalPriorityGroup,
  type SignalsLifecycleGroup,
  type SignalsSortDirection,
  type SignalsSortField,
  signalAssigneeFilterSchema,
  signalSearchSchema,
  signalsLifecycleGroupSchema,
  signalsSortDirectionSchema,
  signalsSortFieldSchema,
  signalsTimeRangeSchema,
  UNASSIGNED_FILTER,
} from "./list-signals-types.ts"
export { TAG_AGGREGATION_FALLBACK_DAYS } from "./signals-list-internals.ts"

const listSignalsInputSchema = z
  .object({
    organizationId: cuidSchema.transform(OrganizationId),
    projectId: cuidSchema.transform(ProjectId),
    signalIds: z.array(signalIdSchema).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .merge(signalsListFiltersSchema)

export type ListSignalsInput = z.input<typeof listSignalsInputSchema>
export type ListSignalsError = RepositoryError

export interface ListSignalsResult {
  readonly items: readonly SignalListItem[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly hasAnySignals: boolean
  readonly limit: number
  readonly offset: number
}

export const listSignalsUseCase = (
  input: ListSignalsInput,
): Effect.Effect<ListSignalsResult, ListSignalsError, SignalRepository | SqlClient> =>
  Effect.gen(function* () {
    const parsed = listSignalsInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))
    const signalRepository = yield* SignalRepository
    const now = parsed.now ?? new Date()
    const selectedTimeRange = toScoreAnalyticsTimeRange(parsed.timeRange)

    let hasAnySignals = parsed.signalIds !== undefined
    if (!parsed.signalIds) {
      hasAnySignals =
        (yield* signalRepository.list({ projectId: parsed.projectId, limit: 1, offset: 0 })).items.length > 0

      if (!hasAnySignals) {
        return {
          items: [],
          totalCount: 0,
          hasMore: false,
          hasAnySignals,
          limit: parsed.limit,
          offset: parsed.offset,
        } satisfies ListSignalsResult
      }
    }

    const page = parsed.signalIds
      ? yield* signalRepository.findByIds({ projectId: parsed.projectId, signalIds: parsed.signalIds }).pipe(
          Effect.map((rows) => {
            const filteredRows = rows.filter((issue) => {
              const candidate = {
                issue,
                windowMetric: makeZeroWindowMetric(issue),
                lifecycleStates: deriveSignalLifecycleStates({
                  issue,
                  isEscalating: issue.lifecycle.isEscalating,
                  isRegressed: issue.lifecycle.isRegressed,
                  now,
                }),
                similarityScore: null,
                firstSeenAt: issue.createdAt,
                lastSeenAt: issue.updatedAt,
                escalationOccurrenceThreshold: null,
              } satisfies AnalyticsCandidate
              return (
                matchesLifecycleGroup(candidate, parsed.lifecycleGroup) &&
                matchesAssigneeFilter(candidate, parsed.assigneeIds)
              )
            })
            return {
              items: filteredRows.slice(parsed.offset, parsed.offset + parsed.limit),
              totalCount: filteredRows.length,
              hasMore: parsed.offset + parsed.limit < filteredRows.length,
              limit: parsed.limit,
              offset: parsed.offset,
            }
          }),
        )
      : yield* signalRepository.listTableRows({
          projectId: parsed.projectId,
          limit: parsed.limit,
          offset: parsed.offset,
          ...(parsed.lifecycleGroup ? { lifecycleGroup: parsed.lifecycleGroup } : {}),
          ...(parsed.assigneeIds ? { assigneeIds: parsed.assigneeIds } : {}),
          ...(parsed.textSearchQuery
            ? { searchQuery: parsed.textSearchQuery }
            : parsed.search
              ? { searchQuery: parsed.search.query }
              : {}),
          ...(selectedTimeRange ? { timeRange: selectedTimeRange } : {}),
          sort: parsed.sort,
        })

    return {
      items: page.items.map((issue) => toLightListItem(issue, now)),
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      hasAnySignals,
      limit: parsed.limit,
      offset: parsed.offset,
    } satisfies ListSignalsResult
  }).pipe(Effect.withSpan("issues.listSignals"))
