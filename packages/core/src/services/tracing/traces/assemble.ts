import { database } from '../../../client'
import { AssembledSpan, AssembledTrace, Span } from '../../../constants'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { SpanMetadatasRepository, SpansRepository } from '../../../repositories'
import { type Workspace } from '../../../schema/models/types/Workspace'

export async function assembleTrace(
  {
    traceId,
    workspace,
  }: {
    traceId: string
    workspace: Workspace
  },
  db = database,
) {
  const repository = new SpansRepository(workspace.id, db)
  const listing = await repository.list({ traceId })
  if (listing.error) return Result.error(listing.error)

  const spans = listing.value
  if (spans.length < 1) {
    return Result.error(
      new UnprocessableEntityError('Cannot assemble an empty trace'),
    )
  }

  const startedAt = new Date(Math.min(...spans.map((s) => s.startedAt.getTime()))) // prettier-ignore
  const endedAt = new Date(Math.max(...spans.map((s) => s.endedAt.getTime()))) // prettier-ignore
  const duration = endedAt.getTime() - startedAt.getTime()

  const childrens = new Map<string, Span[]>()
  for (const span of spans) {
    if (!span.parentId) continue
    const children = childrens.get(span.parentId) || []
    childrens.set(span.parentId, [...children, span])
  }

  for (const children of childrens.values()) {
    children.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  }

  const roots = spans
    .filter((span) => !span.parentId)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

  const assembledSpans = await Promise.all(
    roots.map((span) =>
      assembleSpan({ span, depth: 0, startedAt, childrens, workspace }),
    ),
  )

  const trace: AssembledTrace = {
    id: traceId,
    children: assembledSpans,
    spans: spans.length,
    duration: duration,
    startedAt: startedAt,
    endedAt: endedAt,
  }

  return Result.ok({ trace })
}

async function assembleSpan({
  span,
  depth,
  startedAt,
  childrens,
  workspace,
}: {
  span: Span
  depth: number
  startedAt: Date
  childrens: Map<string, Span[]>
  workspace: Workspace
}): Promise<AssembledSpan> {
  const children = childrens.get(span.id) || []

  const startOffset = span.startedAt.getTime() - startedAt.getTime()
  const endOffset = span.endedAt.getTime() - startedAt.getTime()

  const assembledSpans = await Promise.all(
    children.map((child) =>
      assembleSpan({
        span: child,
        depth: depth + 1,
        startedAt,
        childrens,
        workspace,
      }),
    ),
  )
  // TODO:(tracing): N+1 to disk storage. Ok since N is small but not a good idea. Needed
  // because we need to perform aggregations over multiple spans of a single
  // trace. A better approach is to denormalize all the aggregable attributes
  // into columns in the span table.
  const repo = new SpanMetadatasRepository(workspace.id)
  const metadata = await repo
    .get({ spanId: span.id, traceId: span.traceId })
    .then((r) => r.value)

  return {
    ...span,
    metadata,
    children: assembledSpans,
    depth: depth,
    startOffset: startOffset,
    endOffset: endOffset,
  }
}
