import {
  AssembledSpan,
  AssembledTrace,
  isMainSpan,
  SpanType,
} from '../../../../constants'
import { findLastSpanOfType } from './findLastSpanOfType'

/**
 * Builds a parent map by traversing the trace tree.
 * Returns a map from span ID to its parent span.
 */
function buildParentMap(trace: AssembledTrace): Map<string, AssembledSpan> {
  const parentMap = new Map<string, AssembledSpan>()

  function traverse(span: AssembledSpan, parent?: AssembledSpan) {
    if (parent) {
      parentMap.set(span.id, parent)
    }

    for (const child of span.children || []) {
      traverse(child, span)
    }
  }

  for (const rootSpan of trace.children) {
    traverse(rootSpan)
  }

  return parentMap
}

/**
 * Finds the nearest parent span of type Prompt, External, or Chat.
 * Returns the span itself if it's already one of those types.
 */
function findNearestMainSpan(
  span: AssembledSpan,
  trace: AssembledTrace,
): AssembledSpan | undefined {
  // If the span itself is a main span, return it
  if (isMainSpan(span)) {
    return span
  }

  // Build parent map to traverse up
  const parentMap = buildParentMap(trace)

  // Traverse up the tree to find the nearest main span
  let current: AssembledSpan | undefined = span
  while (current) {
    if (isMainSpan(current)) {
      return current
    }
    current = parentMap.get(current.id)
  }

  return undefined
}

/**
 * Finds the completion span containing the conversation for a specific span.
 *
 * This works by:
 * 1. Finding the nearest parent span of type Prompt, External, or Chat
 * 2. Finding that parent's completion span (stopping before any child main spans)
 * 3. Returning that completion span
 *
 * This allows viewing subagent conversations independently from the parent
 * agent's global conversation.
 *
 * @param span - The span to find the conversation for
 * @param trace - The assembled trace containing the span
 * @returns The completion span containing the conversation, or undefined if not found
 */
export function findCompletionSpanForSpan(
  span: AssembledSpan | undefined,
  trace: AssembledTrace | undefined,
): AssembledSpan<SpanType.Completion> | undefined {
  if (!span || !trace) return undefined

  if (span.type === SpanType.Completion) {
    return span as AssembledSpan<SpanType.Completion>
  }

  const mainSpan = findNearestMainSpan(span, trace)
  if (!mainSpan) return undefined

  return findLastSpanOfType({
    children: mainSpan.children,
    spanType: SpanType.Completion,
    searchNestedAgents: false,
  })
}
