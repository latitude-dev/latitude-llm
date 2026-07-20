export interface SpanTreeSelection {
  readonly traceId: string
  readonly spanId: string
}

export function spanTreeSelectionKey({ traceId, spanId }: SpanTreeSelection): string {
  return `${traceId}:${spanId}`
}

export function getAdjacentSpanSelection(
  visibleSelections: readonly SpanTreeSelection[],
  selectedSpan: SpanTreeSelection | null,
  direction: "next" | "previous",
): SpanTreeSelection | undefined {
  const selectedIndex = selectedSpan
    ? visibleSelections.findIndex((selection) => spanTreeSelectionKey(selection) === spanTreeSelectionKey(selectedSpan))
    : direction === "next"
      ? -1
      : visibleSelections.length

  if (direction === "next") return visibleSelections[selectedIndex + 1] ?? visibleSelections[0]
  return visibleSelections[selectedIndex - 1]
}

export function toggleCollapsedSpan(collapsed: ReadonlySet<string>, selection: SpanTreeSelection): Set<string> {
  const key = spanTreeSelectionKey(selection)
  const next = new Set(collapsed)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
