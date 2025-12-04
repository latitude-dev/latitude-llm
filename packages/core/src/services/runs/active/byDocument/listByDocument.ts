import { DEFAULT_PAGINATION_SIZE } from '../../../../constants'
import {
  ActiveRun,
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
} from '@latitude-data/constants'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import type { Cache } from '../../../../cache'
import { cache as redis } from '../../../../cache'
import { ACTIVE_RUN_CACHE_TTL } from '@latitude-data/constants'

/**
 * Lists active runs for a specific document with pagination.
 * This uses the document-scoped Redis cache for better performance.
 */
export async function listActiveRunsByDocument({
  workspaceId,
  projectId,
  documentUuid,
  page = 1,
  pageSize = DEFAULT_PAGINATION_SIZE,
  cache,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  page?: number
  pageSize?: number
  cache?: Cache
}): PromisedResult<ActiveRun[], Error> {
  const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
    workspaceId,
    projectId,
    documentUuid,
  )
  const redisCache = cache ?? (await redis())

  try {
    // O(N) where N = runs for THIS document only (typically < 10)
    const hashData = await redisCache.hgetall(key)
    if (!hashData || Object.keys(hashData).length === 0) {
      return Result.ok([])
    }

    const activeRuns: ActiveRun[] = []
    const now = Date.now()

    for (const jsonValue of Object.values(hashData)) {
      try {
        const run = JSON.parse(jsonValue) as ActiveRun

        // Skip runs without documentUuid (shouldn't happen with new storage, but defensive)
        if (!run.documentUuid) continue

        const queuedAt = new Date(run.queuedAt)

        // Filter expired runs
        if (queuedAt.getTime() > now - ACTIVE_RUN_CACHE_TTL) {
          activeRuns.push({
            ...run,
            queuedAt,
            startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
          })
        }
      } catch (parseError) {
        // Skip invalid entries
        continue
      }
    }

    // Sort by startedAt (most recent first), then by queuedAt
    const sorted = activeRuns.sort(
      (a, b) =>
        (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0) ||
        b.queuedAt.getTime() - a.queuedAt.getTime(),
    )

    // Apply pagination
    const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)

    return Result.ok(paginated)
  } catch (error) {
    return Result.error(error as Error)
  }
}
