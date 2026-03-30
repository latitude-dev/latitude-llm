import { useLayoutEffect, useMemo, useRef, useState } from "react"
import type { InfiniteTableColumn } from "./types.ts"

interface UseHeaderLayoutLockParams<T> {
  columns: InfiniteTableColumn<T>[]
  hasSelection: boolean
  hasExpansion: boolean
  hasSubheaderRow: boolean
}

export function useHeaderLayoutLock<T>({
  columns,
  hasSelection,
  hasExpansion,
  hasSubheaderRow,
}: UseHeaderLayoutLockParams<T>) {
  const tableRef = useRef<HTMLTableElement>(null)
  const [layoutFixed, setLayoutFixed] = useState(false)
  const headerLayoutKey = useMemo(() => {
    const columnSignature = columns
      .map((col) =>
        [
          col.key,
          col.align ?? "",
          col.minWidth ?? "",
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

      for (const th of headerCells) {
        th.style.width = `${th.offsetWidth}px`
      }
      table.style.width = `${table.offsetWidth}px`
      setLayoutFixed(true)
    }

    lockLayout()
    return () => cancelAnimationFrame(rafId)
  }, [layoutFixed, headerLayoutKey])

  return { tableRef, layoutFixed }
}
