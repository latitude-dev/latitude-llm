import { AssembledSpan, AssembledTrace, SpanType } from '../../../constants'
import { findFirstSpanOfType } from './findFirstSpanOfType'
import { adaptPromptlMessageToLegacy } from '../../../utils/promptlAdapter'

/**
 * Finds the completion span containing the full conversation from a trace.
 *
 * There can be many completion spans in a trace, but only one contains the
 * full conversation. This method finds that span by searching the last
 * completion span in the prompt span's immediate children.
 *
 * @param trace - The assembled trace to search, or undefined
 * @returns The completion span containing the full conversation, or undefined if not found
 */
export function findCompletionSpanFromTrace(trace: AssembledTrace | undefined) {
  if (!trace) return undefined

  const promptSpan = findFirstSpanOfType(trace.children, SpanType.Prompt)
  if (!promptSpan) return undefined

  return promptSpan.children?.reduce(
    (last, span) => (span.type === SpanType.Completion ? span : last),
    undefined as ReturnType<typeof findFirstSpanOfType>,
  ) as AssembledSpan<SpanType.Completion> | undefined
}

export function adaptCompletionSpanMessagesToLegacy(
  span: AssembledSpan<SpanType.Completion> | undefined,
) {
  return [
    ...(span?.metadata?.input || []).map(adaptPromptlMessageToLegacy),
    ...(span?.metadata?.output || []).map(adaptPromptlMessageToLegacy),
  ]
}
