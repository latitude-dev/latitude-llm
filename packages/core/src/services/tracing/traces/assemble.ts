import { database } from '../../../client'
import { AssembledSpan, AssembledTrace, Span } from '../../../constants'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { SpansRepository } from '../../../repositories'
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

  const assembledSpans = roots.map((span) =>
    assembleSpan(span, 0, startedAt, childrens),
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

function assembleSpan(
  span: Span,
  depth: number,
  startedAt: Date,
  childrens: Map<string, Span[]>,
): AssembledSpan {
  const children = childrens.get(span.id) || []

  const startOffset = span.startedAt.getTime() - startedAt.getTime()
  const endOffset = span.endedAt.getTime() - startedAt.getTime()

  const assembledSpans = children.map((child) =>
    assembleSpan(child, depth + 1, startedAt, childrens),
  )

  return {
    ...span,
    children: assembledSpans,
    depth: depth,
    startOffset: startOffset,
    endOffset: endOffset,
  }
}
