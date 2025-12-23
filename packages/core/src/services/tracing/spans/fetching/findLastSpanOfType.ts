import { AssembledSpan, SpanType } from '../../../../constants'

export function findLastSpanOfType<T extends SpanType>(
  children: AssembledSpan<SpanType>[],
  spanType: T,
): AssembledSpan<T> | undefined {
  if (!children || children.length === 0) return undefined

  let lastMatch: AssembledSpan<T> | undefined = undefined
  const queue = [...children]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    if (current.type === spanType) {
      lastMatch = current as AssembledSpan<T>
    }
    if (current.children && current.children.length > 0) {
      queue.push(...current.children)
    }
  }

  return lastMatch
}
