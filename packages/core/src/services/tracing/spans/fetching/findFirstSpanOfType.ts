import { AssembledSpan, SpanType } from '../../../../constants'

export function findFirstSpanOfType<T extends SpanType>(
  children: AssembledSpan<SpanType>[],
  spanType: T,
): AssembledSpan<T> | undefined {
  if (!children || children.length === 0) return undefined

  const queue = [...children]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    if (current.type === spanType) {
      return current as AssembledSpan<T>
    }
    if (current.children && current.children.length > 0) {
      queue.push(...current.children)
    }
  }

  return undefined
}
