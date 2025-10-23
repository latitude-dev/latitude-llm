import { AssembledSpan, SpanType } from '../../../constants'

export function findAllSpansOfType<T extends SpanType>(
  children: AssembledSpan<SpanType>[],
  spanType: T,
): AssembledSpan<T>[] {
  if (!children || children.length === 0) return []

  const results: AssembledSpan<T>[] = []
  const queue = [...children]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    if (current.type === spanType) {
      results.push(current as AssembledSpan<T>)
    }
    if (current.children && current.children.length > 0) {
      queue.push(...current.children)
    }
  }

  return results
}
