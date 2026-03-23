import type { SpanRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

export interface SpanTreeNode {
  readonly span: SpanRecord
  readonly children: SpanTreeNode[]
  depth: number
}

export interface TraceTimeRange {
  readonly minTime: number
  readonly maxTime: number
  readonly totalDuration: number
}

export function buildSpanTree(spans: readonly SpanRecord[]): SpanTreeNode[] {
  const byId = new Map<string, SpanTreeNode>()
  const roots: SpanTreeNode[] = []

  for (const span of spans) {
    byId.set(span.spanId, { span, children: [], depth: 0 })
  }

  for (const node of byId.values()) {
    const parentId = node.span.parentSpanId
    const parent = parentId ? byId.get(parentId) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function setDepth(node: SpanTreeNode, depth: number) {
    node.depth = depth
    node.children.sort((a, b) => a.span.startTime.localeCompare(b.span.startTime))
    for (const child of node.children) setDepth(child, depth + 1)
  }

  for (const root of roots) setDepth(root, 0)
  roots.sort((a, b) => a.span.startTime.localeCompare(b.span.startTime))

  return roots
}

export interface FlattenedNode {
  readonly node: SpanTreeNode
  readonly connectors: readonly boolean[]
  readonly isLastChild: boolean
}

export function flattenTree(roots: readonly SpanTreeNode[], collapsed: ReadonlySet<string>): FlattenedNode[] {
  const result: FlattenedNode[] = []

  function walk(node: SpanTreeNode, parentConnectors: readonly boolean[], isLast: boolean) {
    const connectors = node.depth > 0 ? [...parentConnectors, !isLast] : []
    result.push({ node, connectors, isLastChild: isLast })
    if (!collapsed.has(node.span.spanId)) {
      const kids = node.children
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i]
        if (child) walk(child, connectors, i === kids.length - 1)
      }
    }
  }

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]
    if (root) walk(root, [], i === roots.length - 1)
  }
  return result
}

export function getTraceTimeRange(spans: readonly SpanRecord[]): TraceTimeRange {
  let minTime = Number.POSITIVE_INFINITY
  let maxTime = Number.NEGATIVE_INFINITY

  for (const s of spans) {
    const start = new Date(s.startTime).getTime()
    const end = new Date(s.endTime).getTime()
    if (start < minTime) minTime = start
    if (end > maxTime) maxTime = end
  }

  if (!Number.isFinite(minTime)) {
    return { minTime: 0, maxTime: 0, totalDuration: 0 }
  }

  return { minTime, maxTime, totalDuration: maxTime - minTime }
}

export function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms"
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = ((ms % 60_000) / 1000).toFixed(1)
  return `${mins}m ${secs}s`
}
