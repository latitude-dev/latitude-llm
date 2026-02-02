import { AssembledSpan, isMainSpan, SpanType } from '../../../../constants'

/**
 * Recursively searches for the last span of a given type in a span tree,
 * traversing children in reverse order (last to first).
 *
 * @param children - The array of child spans to search through
 * @param spanType - The type of span to find
 * @param searchNestedAgents - Whether to recurse into nested agent spans
 *   (prompt, chat, external). When true (default), searches through everything
 *   including nested agent hierarchies. When false, the search stops at agent
 *   boundaries, useful for finding spans within a specific agent scope without
 *   descending into subagent spans.
 * @returns The last matching span, or undefined if not found
 */
export function findLastSpanOfType<T extends SpanType>({
  children,
  spanType,
  searchNestedAgents = true,
}: {
  children: AssembledSpan<SpanType>[]
  spanType: T
  searchNestedAgents?: boolean
}): AssembledSpan<T> | undefined {
  if (!children || children.length < 1) return undefined

  const reversedChildren = [...children].reverse()

  for (const child of reversedChildren) {
    if (child.type === spanType) return child as AssembledSpan<T>
    if (isMainSpan(child) && !searchNestedAgents) continue

    const innerCompletion = findLastSpanOfType({
      children: child.children,
      spanType,
      searchNestedAgents,
    })
    if (innerCompletion) return innerCompletion
  }

  return undefined
}
