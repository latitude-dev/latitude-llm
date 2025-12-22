import { AssembledSpan, SpanType } from '../../../../constants'

export function findSpanById(
  children: AssembledSpan<SpanType>[],
  spanId?: string | null,
): AssembledSpan<SpanType> | undefined {
  if (!spanId) return undefined
  if (!children || children.length === 0 || !spanId) return undefined

  const queue = [...children]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    if (current.id === spanId) {
      return current
    }
    if (current.children && current.children.length > 0) {
      queue.push(...current.children)
    }
  }

  return undefined
}
