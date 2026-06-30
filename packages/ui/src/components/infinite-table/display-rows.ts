/**
 * Virtualized row model: data rows interleaved with injected group header
 * rows (see `getRowGroup`). Data entries point back into `data` by index so
 * selection/active-row/render contracts keep operating on data positions.
 */
export type DisplayRow =
  | { readonly kind: "group"; readonly groupKey: string }
  | { readonly kind: "data"; readonly dataIndex: number }

/**
 * Buckets rows by group, emitting exactly one header per group followed by all
 * of that group's rows. Run-length grouping would re-emit a header on every
 * group transition, so any break in contiguity (e.g. offset-paginated pages
 * briefly out of order) produced duplicate/empty headers; bucketing guarantees
 * one contiguous section per group regardless of input order.
 *
 * Section order follows `groupOrder` when given (groups absent there render
 * last, in first-appearance order), else first-appearance order. Row order
 * within a section always follows `data`.
 */
export function buildDisplayRows<T>(
  data: readonly T[],
  getRowGroup: ((row: T) => string) | undefined,
  hasGrouping: boolean,
  groupOrder?: readonly string[],
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

  const orderedKeys = groupOrder
    ? [
        ...groupOrder.filter((key) => buckets.has(key)),
        ...[...buckets.keys()].filter((key) => !groupOrder.includes(key)),
      ]
    : [...buckets.keys()]

  const rows: DisplayRow[] = []
  for (const groupKey of orderedKeys) {
    const indices = buckets.get(groupKey)
    if (!indices) continue
    rows.push({ kind: "group", groupKey })
    for (const dataIndex of indices) rows.push({ kind: "data", dataIndex })
  }
  return rows
}
