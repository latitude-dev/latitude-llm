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
import { findAllSpansOfType } from '../spans/fetching/findAllSpansOfType'
import { findCompletionSpanFromTrace } from '../spans/fetching/findCompletionSpanFromTrace'
import { findCompletionSpanForSpan } from '../spans/fetching/findCompletionSpanForSpan'
import { findSpanById } from '../spans/fetching/findSpanById'
import { Workspace } from '../../../schema/models/types/Workspace'

type WorkspaceRef = Pick<Workspace, 'id'>

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
    workspace: WorkspaceRef
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
 * Assemble the trace structure and attach metadata to all completion spans.
 * This includes conversation messages and enables aggregation of tokens and
 * costs across completions. Also selects a main completion span scoped to the
 * nearest Prompt/External/Chat ancestor of the provided span.
 *
 * @param params - Trace lookup parameters.
 * @param params.traceId - Trace identifier to assemble.
 * @param params.workspace - Workspace owning the trace (only id is required).
 * @param params.spanId - Span used to scope the main completion selection.
 * @param db - Database connection override.
 * @returns Result with the assembled trace and optional main completion span.
 */
export async function assembleTraceWithMessages(
  {
    traceId,
    workspace,
    spanId,
  }: {
    traceId: string
    workspace: WorkspaceRef
    spanId?: string
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

  const allCompletionSpans = findAllSpansOfType(
    trace.children,
    SpanType.Completion,
  )

  if (allCompletionSpans.length > 0) {
    const metadataRepo = new SpanMetadatasRepository(workspace.id)
    const spanIdentifiers = allCompletionSpans.map((span) => ({
      traceId: span.traceId,
      spanId: span.id,
    }))
    const metadataMap =
      await metadataRepo.getBatch<SpanType.Completion>(spanIdentifiers)

    for (const span of allCompletionSpans) {
      const key = `${span.traceId}:${span.id}`
      const metadata = metadataMap.get(key)
      if (metadata) {
        span.metadata = metadata as CompletionSpanMetadata
      }
    }
  }

  const targetSpan = findSpanById(trace.children, spanId)

  let completionSpan: AssembledSpan<SpanType.Completion> | undefined
  if (targetSpan) {
    completionSpan = findCompletionSpanForSpan(targetSpan, trace)
  }

  if (!completionSpan) {
    completionSpan = findCompletionSpanFromTrace(trace)
  }

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
