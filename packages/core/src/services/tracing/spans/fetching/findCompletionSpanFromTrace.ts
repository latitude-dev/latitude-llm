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
 * Recursively finds the last completion span in a subtree.
 */
function findLastCompletionSpan(
  spans: AssembledSpan[],
): AssembledSpan<SpanType.Completion> | undefined {
  let lastCompletion: AssembledSpan<SpanType.Completion> | undefined

  for (const span of spans) {
    if (span.type === SpanType.Completion) {
      lastCompletion = span as AssembledSpan<SpanType.Completion>
    }
    // Recursively search children
    if (span.children && span.children.length > 0) {
      const childCompletion = findLastCompletionSpan(span.children)
      if (childCompletion) {
        lastCompletion = childCompletion
      }
    }
  }

  return lastCompletion
}

/**
 * Finds the completion span containing the full conversation from a trace.
 *
 * There can be many completion spans in a trace, but only one contains the
 * full conversation. This method finds that span by recursively searching
 * the main span's (Prompt, Chat, or External) descendants for the last
 * completion span.
 *
 * @param trace - The assembled trace to search, or undefined
 * @returns The completion span containing the full conversation, or undefined if not found
 */
export function findCompletionSpanFromTrace(trace: AssembledTrace | undefined) {
  if (!trace) return undefined

  const rootSpans = findRootSpans(trace)
  const lastSibling = rootSpans.at(-1)
  if (!lastSibling) return undefined

  // Recursively search for the last completion span in the entire subtree
  return findLastCompletionSpan(lastSibling.children || [])
}

export function adaptCompletionSpanMessagesToLegacy(
  span: AssembledSpan<SpanType.Completion> | undefined,
) {
  return [
    ...(span?.metadata?.input || []).map(adaptPromptlMessageToLegacy),
    ...(span?.metadata?.output || []).map(adaptPromptlMessageToLegacy),
  ]
}
