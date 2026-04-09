import { useLayoutEffect, useMemo, useRef, useState } from "react"
import type { InfiniteTableColumn } from "./types.ts"

interface MeasurableHeaderCell {
  offsetWidth: number
}

interface UseHeaderLayoutLockParams<T> {
  columns: InfiniteTableColumn<T>[]
  hasSelection: boolean
  hasExpansion: boolean
  hasSubheaderRow: boolean
}

interface ResolveLockedHeaderLayoutParams<T> {
  headerCells: readonly MeasurableHeaderCell[]
  columns: readonly InfiniteTableColumn<T>[]
  leadingColumnCount: number
  measuredTableWidth: number
}

export function resolveLockedHeaderLayout<T>({
  headerCells,
  columns,
  leadingColumnCount,
  measuredTableWidth,
}: ResolveLockedHeaderLayoutParams<T>) {
  const lockedHeaderWidths = headerCells.map((headerCell, headerIndex) => {
    const column = columns[headerIndex - leadingColumnCount]
    return Math.max(headerCell.offsetWidth, column?.width ?? 0)
  })

  return {
    lockedHeaderWidths,
    lockedTableWidth: Math.max(
      measuredTableWidth,
      lockedHeaderWidths.reduce((totalWidth, width) => totalWidth + width, 0),
    ),
  }
}

export function useHeaderLayoutLock<T>({
  columns,
  hasSelection,
  hasExpansion,
  hasSubheaderRow,
}: UseHeaderLayoutLockParams<T>) {
  const tableRef = useRef<HTMLTableElement>(null)
  const [layoutFixed, setLayoutFixed] = useState(false)
  const leadingColumnCount = (hasSelection ? 1 : 0) + (hasExpansion ? 1 : 0)
  const headerLayoutKey = useMemo(() => {
    const columnSignature = columns
      .map((col) =>
        [
          col.key,
          col.align ?? "",
          col.minWidth ?? "",
          col.width ?? "",
          col.resizable ?? "",
          col.sortKey ?? "",
          col.renderSubheader ? "1" : "0",
        ].join(":"),
      )
      .join("|")

    return `${columnSignature}|selection:${hasSelection ? "1" : "0"}|expansion:${hasExpansion ? "1" : "0"}|subheader:${hasSubheaderRow ? "1" : "0"}`
  }, [columns, hasSelection, hasExpansion, hasSubheaderRow])

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return

    const headerRow = table.querySelector("thead tr")
    if (!headerRow) return

    const headerCells = Array.from(headerRow.children) as HTMLTableCellElement[]
    if (headerCells.length === 0) return

    for (const th of headerCells) {
      th.style.width = ""
    }
    table.style.width = ""
    setLayoutFixed(false)
  }, [headerLayoutKey])

  useLayoutEffect(() => {
    if (layoutFixed) return
    const table = tableRef.current
    if (!table) return

    let rafId = 0

    const lockLayout = () => {
      const headerRow = table.querySelector("thead tr")
      if (!headerRow) return

      const headerCells = Array.from(headerRow.children) as HTMLTableCellElement[]
      if (headerCells.length === 0) return

      // Lock once headers are measurable so interactive header content changes do not reflow columns.
      if (table.offsetWidth === 0 || headerCells.some((th) => th.offsetWidth === 0)) {
        rafId = requestAnimationFrame(lockLayout)
        return
      }

      const { lockedHeaderWidths, lockedTableWidth } = resolveLockedHeaderLayout({
        headerCells,
        columns,
        leadingColumnCount,
        measuredTableWidth: table.offsetWidth,
      })

      for (const [index, th] of headerCells.entries()) {
        th.style.width = `${lockedHeaderWidths[index]}px`
      }
      table.style.width = `${lockedTableWidth}px`
      setLayoutFixed(true)
    }

    lockLayout()
    return () => cancelAnimationFrame(rafId)
  }, [layoutFixed, headerLayoutKey])

  return { tableRef, layoutFixed }
}
