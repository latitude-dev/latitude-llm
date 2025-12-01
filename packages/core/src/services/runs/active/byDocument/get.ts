import {
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
  ActiveRun,
  Run,
  Span,
  SpanType,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../../cache'
import { NotFoundError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import { spanToRun } from '../../spanToRun'
import { SpansRepository } from '../../../../repositories'

/**
 * Gets a run by UUID from document-scoped storage.
 * Checks the database first (for completed runs), then the document-scoped cache.
 */
export async function getRunByDocument({
  workspaceId,
  projectId,
  documentUuid,
  runUuid,
  cache,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  runUuid: string
  cache?: Cache
}): PromisedResult<Run, Error> {
  // First check database for completed runs
  const spansRepo = new SpansRepository(workspaceId)
  const traceId = await spansRepo.getLastTraceByLogUuid(runUuid)
  if (traceId) {
    const spans = await spansRepo.list({ traceId }).then((r) => r.value)
    if (spans) {
      const promptSpan = spans.find((s) => s.type === 'prompt')
      if (promptSpan) {
        const run = await spanToRun({
          workspaceId,
          span: promptSpan as Span<SpanType.Prompt>,
        })

        return Result.ok(run)
      }
    }
  }

  // Check document-scoped cache for active runs
  const documentKey = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
    workspaceId,
    projectId,
    documentUuid,
  )
  const redisCache = cache ?? (await redis())

  try {
    const jsonValue = await redisCache.hget(documentKey, runUuid)
    if (jsonValue) {
      const run = JSON.parse(jsonValue) as ActiveRun
      return Result.ok({
        ...run,
        queuedAt: new Date(run.queuedAt),
        startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
      } as Run)
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Malformed JSON in cache, return not found error
      return Result.error(
        new NotFoundError(
          `Syntax error while getting run from cache with uuid ${runUuid}`,
        ),
      )
    }
    // Redis connection error - rethrow or handle appropriately
    return Result.error(error as Error)
  }

  // Not found in cache
  return Result.error(new NotFoundError(`Run not found with uuid ${runUuid}`))
}
