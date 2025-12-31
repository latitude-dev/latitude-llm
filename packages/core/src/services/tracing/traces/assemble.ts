import { database } from '../../../client'
import {
  AssembledSpan,
  AssembledTrace,
  CompletionSpanMetadata,
  Span,
  SpanType,
} from '../../../constants'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { SpanMetadatasRepository, SpansRepository } from '../../../repositories'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { findCompletionSpanFromTrace } from '../spans/fetching/findCompletionSpanFromTrace'

/**
 * Assembles a trace structure without fetching span metadata.
 * Use this for timeline/graph visualization where metadata is not needed.
 */
export async function assembleTraceStructure(
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

  const assembledSpans = roots.map((span) =>
    assembleSpanStructure({ span, depth: 0, startedAt, childrens }),
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

/**
 * Assembles a trace structure and fetches only the completion span's metadata.
 * Use this when you need the trace structure plus the conversation messages.
 * The metadata is attached to both the returned completionSpan AND to the
 * completion span within the trace tree for backward compatibility.
 */
export async function assembleTraceWithMessages(
  {
    traceId,
    workspace,
  }: {
    traceId: string
    workspace: Workspace
  },
  db = database,
): PromisedResult<{
  trace: AssembledTrace
  completionSpan?: AssembledSpan<SpanType.Completion>
}> {
  const structureResult = await assembleTraceStructure(
    { traceId, workspace },
    db,
  )
  if (!Result.isOk(structureResult)) return structureResult

  const { trace } = structureResult.unwrap()
  const completionSpan = findCompletionSpanFromTrace(trace)

  if (!completionSpan) {
    return Result.ok({ trace, completionSpan: undefined })
  }

  const metadataRepo = new SpanMetadatasRepository(workspace.id)
  const metadataResult = await metadataRepo.get({
    spanId: completionSpan.id,
    traceId: completionSpan.traceId,
  })
  if (!Result.isOk(metadataResult)) return metadataResult

  // Attach metadata to the completion span in the tree for backward compatibility
  // This mutates the span in place so findCompletionSpanFromTrace(trace) returns
  // a span with metadata attached
  completionSpan.metadata = metadataResult.unwrap() as
    | CompletionSpanMetadata
    | undefined

  return Result.ok({ trace, completionSpan })
}

function assembleSpanStructure({
  span,
  depth,
  startedAt,
  childrens,
}: {
  span: Span
  depth: number
  startedAt: Date
  childrens: Map<string, Span[]>
}): AssembledSpan {
  const children = childrens.get(span.id) || []

  const startOffset = span.startedAt.getTime() - startedAt.getTime()
  const endOffset = span.endedAt.getTime() - startedAt.getTime()

  const assembledSpans = children.map((child) =>
    assembleSpanStructure({
      span: child,
      depth: depth + 1,
      startedAt,
      childrens,
    }),
  )

  return {
    ...span,
    children: assembledSpans,
    depth: depth,
    startOffset: startOffset,
    endOffset: endOffset,
  }
}
