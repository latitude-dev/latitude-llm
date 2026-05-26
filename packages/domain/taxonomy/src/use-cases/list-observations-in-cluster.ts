import { type OrganizationId, type ProjectId, SessionId, type TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyObservation } from "../entities/observation.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"

export interface ListTaxonomyObservationsInClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyClusterId
  readonly cursor?: string
  readonly pageSize?: number
}

export interface ListObservationsInClusterResult {
  readonly observations: readonly TaxonomyObservation[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
  readonly pageSize: number
}

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

const pageSize = (input: number | undefined): number => Math.min(Math.max(input ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

const encodeCursor = (observation: TaxonomyObservation): string =>
  `${observation.startTime.toISOString()}|${encodeURIComponent(observation.sessionId)}`

const parseCursor = (
  cursor: string | undefined,
): { readonly beforeStartTime: Date; readonly beforeSessionId: SessionId } | undefined => {
  if (!cursor) return undefined
  const separator = cursor.indexOf("|")
  if (separator < 0) return undefined
  const beforeStartTime = new Date(cursor.slice(0, separator))
  if (Number.isNaN(beforeStartTime.getTime())) return undefined
  return { beforeStartTime, beforeSessionId: SessionId(decodeURIComponent(cursor.slice(separator + 1))) }
}

export const listObservationsInClusterUseCase = (input: ListTaxonomyObservationsInClusterInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const observations = yield* BehaviorObservationRepository
    const limit = pageSize(input.pageSize)
    const cursor = parseCursor(input.cursor)
    const rows = yield* observations.listByCluster({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      limit: limit + 1,
      ...(cursor === undefined ? {} : cursor),
    })
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      observations: page,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      pageSize: limit,
    } satisfies ListObservationsInClusterResult
  }).pipe(Effect.withSpan("taxonomy.listObservationsInCluster"))
