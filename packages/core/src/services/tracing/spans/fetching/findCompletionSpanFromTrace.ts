import {
  AssembledSpan,
  AssembledTrace,
  isMainSpan,
  SpanType,
} from '../../../../constants'
import { adaptPromptlMessageToLegacy } from '../../../../utils/promptlAdapter'

function findRootSpans(trace: AssembledTrace): AssembledSpan[] {
  return trace.children
    .filter((span) => isMainSpan(span) && !span.parentId)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
}

/**
 * Finds the completion span containing the full conversation from a trace.
 *
 * There can be many completion spans in a trace, but only one contains the
 * full conversation. This method finds that span by searching the last
 * completion span in the main span's (Prompt, Chat, or External) immediate children.
 *
 * @param trace - The assembled trace to search, or undefined
 * @returns The completion span containing the full conversation, or undefined if not found
 */
export function findCompletionSpanFromTrace(trace: AssembledTrace | undefined) {
  if (!trace) return undefined

  const rootSpans = findRootSpans(trace)
  const lastSibling = rootSpans.at(-1)
  if (!lastSibling) return undefined

  return lastSibling.children?.reduce<
    AssembledSpan<SpanType.Completion> | undefined
  >(
    (
      last: AssembledSpan<SpanType.Completion> | undefined,
      span: AssembledSpan,
    ) =>
      span.type === SpanType.Completion
        ? (span as AssembledSpan<SpanType.Completion>)
        : last,
    undefined,
  )
}

export function adaptCompletionSpanMessagesToLegacy(
  span: AssembledSpan<SpanType.Completion> | undefined,
) {
  return [
    ...(span?.metadata?.input || []).map(adaptPromptlMessageToLegacy),
    ...(span?.metadata?.output || []).map(adaptPromptlMessageToLegacy),
  ]
}
