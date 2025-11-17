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
import { spanToRun } from '../spanToRun'

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

  // TODO(tracing): N+1
  const runs = await Promise.all(
    Array.from(uniqueSpans.values()).map((span) =>
      spanToRun({ workspaceId, span: span as Span<SpanType.Prompt> }),
    ),
  )

  return Result.ok({ items: runs, next })
}
