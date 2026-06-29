/**
 * Virtualized row model: data rows interleaved with injected group header
 * rows (see `getRowGroup`). Data entries point back into `data` by index so
 * selection/active-row/render contracts keep operating on data positions.
 */
export type DisplayRow =
  | { readonly kind: "group"; readonly groupKey: string }
  | { readonly kind: "data"; readonly dataIndex: number }

/**
 * Buckets rows by group in first-appearance order, emitting exactly one header
 * per group followed by all of that group's rows. Run-length grouping would
 * re-emit a header on every group transition, so any break in contiguity (e.g.
 * offset-paginated pages briefly out of order) produced duplicate/empty
 * headers; bucketing guarantees one contiguous section per group regardless of
 * input order.
 */
export function buildDisplayRows<T>(
  data: readonly T[],
  getRowGroup: ((row: T) => string) | undefined,
  hasGrouping: boolean,
): readonly DisplayRow[] {
  if (!hasGrouping || !getRowGroup) {
    return data.map((_, dataIndex) => ({ kind: "data", dataIndex }))
  }

  const buckets = new Map<string, number[]>()
  data.forEach((row, dataIndex) => {
    const groupKey = getRowGroup(row)
    const bucket = buckets.get(groupKey)
    if (bucket) bucket.push(dataIndex)
    else buckets.set(groupKey, [dataIndex])
  })

  const rows: DisplayRow[] = []
  for (const [groupKey, indices] of buckets) {
    rows.push({ kind: "group", groupKey })
    for (const dataIndex of indices) rows.push({ kind: "data", dataIndex })
  }
  return rows
}
