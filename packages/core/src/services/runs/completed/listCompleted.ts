import {
  CompletedRun,
  DEFAULT_PAGINATION_SIZE,
  LogSources,
  RUN_SOURCES,
  RunSourceGroup,
  Span,
  SpanType,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { SpansRepository } from '../../../repositories'
import { spansToRunsBatch } from '../spanToRunBatch'

export async function listCompletedRuns({
  type,
  workspaceId,
  projectId,
  source,
  from,
  limit = DEFAULT_PAGINATION_SIZE,
  sourceGroup,
}: {
  type?: SpanType
  workspaceId: number
  projectId: number
  from?: { startedAt: string; id: string }
  limit?: number
  source?: LogSources[]
  sourceGroup?: RunSourceGroup
}): PromisedResult<
  { items: CompletedRun[]; next: { startedAt: string; id: string } | null },
  Error
> {
  const logSources =
    sourceGroup !== undefined
      ? RUN_SOURCES[sourceGroup]
      : (source ?? [
          LogSources.API,
          LogSources.Playground,
          LogSources.Experiment,
        ])

  const spansRepo = new SpansRepository(workspaceId)
  const { items, next } = await spansRepo
    .findByProjectLimited({
      projectId,
      type,
      from,
      source: logSources,
      limit,
    })
    .then((r) => r.value)

  // Filter to get only unique spans by documentLogUuid
  const uniqueSpans = items.reduce((acc, span) => {
    if (span.documentLogUuid && !acc.has(span.documentLogUuid)) {
      acc.set(span.documentLogUuid, span)
    }
    return acc
  }, new Map<string, Span>())

  // Use batched version to avoid N+1 query problem and reduce memory usage
  const runs = await spansToRunsBatch({
    workspaceId,
    spans: Array.from(uniqueSpans.values()) as Span<SpanType.Prompt>[],
  })

  return Result.ok({ items: runs, next })
}
