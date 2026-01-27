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
import { findAllSpansOfType } from '../spans/fetching/findAllSpansOfType'
import { findCompletionSpanFromTrace } from '../spans/fetching/findCompletionSpanFromTrace'
import { findCompletionSpanForSpan } from '../spans/fetching/findCompletionSpanForSpan'
import { findSpanById } from '../spans/fetching/findSpanById'

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
 * Assembles a trace structure and fetches metadata for ALL completion spans.
 * Use this when you need the trace structure plus the conversation messages.
 * The metadata is attached to ALL completion spans within the trace tree,
 * enabling proper aggregation of tokens and costs across all completions.
 *
 * Additionally returns a "main" completion span which is determined by finding
 * the nearest parent span of type Prompt, External, or Chat for the specified
 * span, then finding that parent's latest Completion child. This allows viewing
 * span-specific conversations (e.g., subagent conversations) rather than always
 * showing the global trace conversation.
 */
export async function assembleTraceWithMessages(
  {
    traceId,
    workspace,
    spanId,
  }: {
    traceId: string
    workspace: Workspace
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
