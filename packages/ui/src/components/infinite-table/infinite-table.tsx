import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../utils/cn.ts"
import type { SortDirection } from "../../utils/filtersHelpers.ts"
import { Checkbox } from "../checkbox/checkbox.tsx"
import { Text } from "../text/text.tsx"
import { DataRow } from "./data-row.tsx"
import { HeaderCell } from "./header-cell.tsx"
import type { InfiniteTableProps } from "./types.ts"

const ROW_HEIGHT = 40
const SKELETON_ROW_COUNT = 8

function nextSortDirection(current: SortDirection | null): SortDirection | null {
  if (current === null) return "desc"
  if (current === "desc") return "asc"
  return null
}

export function InfiniteTable<T>({
  data,
  isLoading,
  columns,
  getRowKey,
  onRowClick,
  activeRowKey,
  selection,
  infiniteScroll,
  sorting,
  defaultSorting,
  onSortChange,
  blankSlate,
  className,
}: InfiniteTableProps<T>) {
  const colCount = columns.length + (selection ? 1 : 0)
  const hasMore = infiniteScroll?.hasMore ?? false
  const totalVirtualRows = data.length + (hasMore || (isLoading && data.length === 0) ? SKELETON_ROW_COUNT : 0)

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleSortClick = useCallback(
    (sortKey: string) => {
      if (!onSortChange) return

      const isDefaultColumn = defaultSorting?.column === sortKey
      const currentDirection = sorting?.column === sortKey ? sorting.direction : null
      const next = nextSortDirection(currentDirection)

      if (isDefaultColumn) {
        const dir = currentDirection === "desc" ? "asc" : "desc"
        onSortChange({ column: sortKey, direction: dir })
      } else if (next) {
        onSortChange({ column: sortKey, direction: next })
      } else if (defaultSorting) {
        onSortChange(defaultSorting)
      }

      scrollContainerRef.current?.scrollTo({ top: 0 })
    },
    [sorting, defaultSorting, onSortChange],
  )

  const virtualizer = useVirtualizer({
    count: totalVirtualRows,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!infiniteScroll || !hasMore || infiniteScroll.isLoadingMore) return
      const target = e.currentTarget
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
      if (distanceToBottom < ROW_HEIGHT * 5) {
        infiniteScroll.onLoadMore()
      }
    },
    [infiniteScroll, hasMore],
  )

  const virtualRows = virtualizer.getVirtualItems()

  const rowKeys = useMemo(() => data.map(getRowKey), [data, getRowKey])

  const activeRowIndex = useMemo(() => {
    if (activeRowKey == null || activeRowKey === "") return -1
    return data.findIndex((row) => getRowKey(row) === activeRowKey)
  }, [activeRowKey, data, getRowKey])

  const tableRef = useRef<HTMLTableElement>(null)
  const [layoutFixed, setLayoutFixed] = useState(false)

  useLayoutEffect(() => {
    if (layoutFixed || data.length === 0) return
    const table = tableRef.current
    if (!table) return

    const headerRow = table.querySelector("thead tr")
    if (!headerRow) return

    for (const th of Array.from(headerRow.children) as HTMLTableCellElement[]) {
      th.style.width = `${th.offsetWidth}px`
    }
    table.style.width = `${table.offsetWidth}px`
    setLayoutFixed(true)
  }, [layoutFixed, data.length])

  useLayoutEffect(() => {
    if (activeRowIndex < 0) return

    const scrollActiveRowIntoView = () => {
      virtualizer.scrollToIndex(activeRowIndex, {
        align: "center",
        behavior: "instant",
      })
    }

    scrollActiveRowIntoView()
    const rafId = requestAnimationFrame(scrollActiveRowIntoView)
    return () => cancelAnimationFrame(rafId)
  }, [activeRowIndex, virtualizer])

  const paddingTop = virtualRows[0]?.start ?? 0
  const lastRow = virtualRows[virtualRows.length - 1]
  const paddingBottom = lastRow ? virtualizer.getTotalSize() - lastRow.end : 0
  const showBlankSlate = !isLoading && data.length === 0 && !layoutFixed
  const blankSlateText = blankSlate && blankSlate === "string" ? blankSlate : "No data found."
  const blankSlateContent =
    showBlankSlate && blankSlate !== undefined ? (
      typeof blankSlate === "string" ? (
        <div className="rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-linear-to-b from-secondary to-transparent px-4">
          <Text.H5 align="center" display="block" color="foregroundMuted">
            {blankSlateText}
          </Text.H5>
        </div>
      ) : (
        blankSlate
      )
    ) : null
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {blankSlateContent ? (
        blankSlateContent
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={cn("flex-1 min-h-0 overflow-auto custom-scrollbar", className)}
        >
          <table
            ref={tableRef}
            className={cn("min-w-full border-separate border-spacing-y-1", { "table-fixed": layoutFixed })}
          >
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                {selection && (
                  <HeaderCell resizable={false} className="w-10">
                    <Checkbox checked={selection.headerState} onCheckedChange={() => selection.toggleAll()} />
                  </HeaderCell>
                )}
                {columns.map((col, i) => {
                  const isSortable = !!col.sortKey && !!onSortChange
                  const sortDir = sorting && sorting.column === col.sortKey ? sorting.direction : null
                  return (
                    <HeaderCell
                      key={col.key}
                      {...(col.align ? { align: col.align } : {})}
                      resizable={col.resizable !== false && i < columns.length - 1}
                      {...(col.minWidth !== undefined ? { minWidth: col.minWidth } : {})}
                      {...(isSortable && col.sortKey
                        ? {
                            sortable: true,
                            sortDirection: sortDir,
                            onSortClick: () => handleSortClick(col.sortKey as string),
                          }
                        : {})}
                    >
                      {col.header}
                    </HeaderCell>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr>
                  <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: "none" }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const index = virtualRow.index

                if (index >= data.length) {
                  const skeletonIndex = index - data.length
                  return (
                    <tr
                      key={`skeleton-${skeletonIndex}`}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="bg-secondary"
                      style={{
                        opacity: 1 - skeletonIndex / SKELETON_ROW_COUNT,
                      }}
                    >
                      <td colSpan={colCount} className="h-9" />
                    </tr>
                  )
                }

                const row = data[index]
                const rowKey = rowKeys[index]
                if (!row || rowKey === undefined) return null

                return (
                  <DataRow
                    key={rowKey}
                    row={row}
                    rowKey={rowKey}
                    columns={columns}
                    hasSelection={!!selection}
                    isActive={activeRowKey === rowKey}
                    {...(selection
                      ? {
                          isSelected: selection.isSelected(rowKey),
                          onToggleRow: selection.toggleRow,
                        }
                      : {})}
                    {...(onRowClick ? { onClick: onRowClick } : {})}
                    dataIndex={virtualRow.index}
                    measureRef={virtualizer.measureElement}
                  />
                )
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td
                    colSpan={colCount}
                    style={{
                      height: paddingBottom,
                      padding: 0,
                      border: "none",
                    }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
