import { useVirtualizer } from "@tanstack/react-virtual"
import { InfoIcon } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { cn } from "../../utils/cn.ts"
import type { SortDirection } from "../../utils/filtersHelpers.ts"
import { Checkbox } from "../checkbox/checkbox.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { DataRow } from "./data-row.tsx"
import { HeaderCell } from "./headers/header-cell.tsx"
import type { InfiniteTableProps } from "./types.ts"
import { useHeaderLayoutLock } from "./use-header-layout-lock.ts"

const ROW_HEIGHT = 40
const SKELETON_ROW_COUNT = 8
const EXPANDED_SKELETON_COUNT = 3

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
  getRowClassName,
  onRowClick,
  rowInteractionRole = "button",
  getRowAriaLabel,
  activeRowKey,
  activeRowAutoScroll = false,
  selection,
  infiniteScroll,
  sorting,
  defaultSorting,
  onSortChange,
  blankSlate,
  scrollAreaLayout = "fill",
  className,
  expandedRowKeys,
  getExpandedRows,
}: InfiniteTableProps<T>) {
  const hasExpansion = !!expandedRowKeys && !!getExpandedRows
  const colCount = columns.length + (selection ? 1 : 0) + (hasExpansion ? 1 : 0)
  const hasSubheaderRow = useMemo(() => columns.some((col) => col.renderSubheader != null), [columns])
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

  const { tableRef, layoutFixed } = useHeaderLayoutLock({
    columns,
    hasSelection: !!selection,
    hasExpansion,
    hasSubheaderRow,
    containerRef: scrollContainerRef,
  })

  useLayoutEffect(() => {
    if (!activeRowAutoScroll || activeRowIndex < 0) return

    const scrollActiveRowIntoView = () => {
      virtualizer.scrollToIndex(activeRowIndex, {
        align: "center",
        behavior: "instant",
      })
    }

    scrollActiveRowIntoView()
    const rafId = requestAnimationFrame(scrollActiveRowIntoView)
    return () => cancelAnimationFrame(rafId)
  }, [activeRowAutoScroll, activeRowIndex, virtualizer])

  const paddingTop = virtualRows[0]?.start ?? 0
  const lastRow = virtualRows[virtualRows.length - 1]
  const paddingBottom = lastRow ? virtualizer.getTotalSize() - lastRow.end : 0
  const showBlankSlate = !isLoading && data.length === 0
  const blankSlateText = blankSlate && blankSlate === "string" ? blankSlate : "No data"
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
    <div className={cn("flex flex-col min-h-0", scrollAreaLayout === "fill" ? "flex-1" : "w-full max-w-full")}>
      {blankSlateContent ? (
        blankSlateContent
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={cn(
            scrollAreaLayout === "fill" ? "min-h-0 flex-1" : "min-h-0 w-full max-w-full",
            "overflow-auto",
            className,
          )}
        >
          <table
            ref={tableRef}
            className={cn("min-w-full border-separate border-spacing-y-1", { "table-fixed": layoutFixed })}
          >
            <thead className="sticky top-0 z-10 border-b border-border bg-background">
              <tr>
                {hasExpansion && <HeaderCell resizable={false} className="w-8" showSubheaderSlot={hasSubheaderRow} />}
                {selection && (
                  <HeaderCell resizable={false} className="w-10" showSubheaderSlot={hasSubheaderRow}>
                    <Checkbox checked={selection.headerState} onCheckedChange={() => selection.toggleAll()} />
                  </HeaderCell>
                )}
                {columns.map((col, i) => {
                  const isSortable = !!col.sortKey && !!onSortChange
                  const sortDir = col.sortKey
                    ? sorting && sorting.column === col.sortKey
                      ? sorting.direction
                      : sorting === undefined && defaultSorting?.column === col.sortKey
                        ? defaultSorting.direction
                        : null
                    : null
                  return (
                    <HeaderCell
                      key={col.key}
                      {...(col.align ? { align: col.align } : {})}
                      resizable={col.resizable !== false && i < columns.length - 1}
                      {...(col.minWidth !== undefined ? { minWidth: col.minWidth } : {})}
                      {...(col.width !== undefined ? { width: col.width } : {})}
                      showSubheaderSlot={hasSubheaderRow}
                      {...(hasSubheaderRow ? { subheader: col.renderSubheader?.(col, i) } : {})}
                      {...(sortDir ? { sortDirection: sortDir } : {})}
                      {...(isSortable && col.sortKey
                        ? {
                            sortable: true,
                            onSortClick: () => handleSortClick(col.sortKey as string),
                          }
                        : {})}
                    >
                      {col.headerTooltip ? (
                        <Tooltip
                          asChild
                          trigger={
                            <span className="flex justify-center items-center gap-1">
                              <Text.H6 weight="medium" color="foregroundMuted" noWrap>
                                {col.header}
                              </Text.H6>
                              <Icon icon={InfoIcon} size="xs" color="foregroundMuted" className="shrink-0" />
                            </span>
                          }
                        >
                          {col.headerTooltip}
                        </Tooltip>
                      ) : (
                        col.header
                      )}
                    </HeaderCell>
                  )
                })}
              </tr>
            </thead>
            {paddingTop > 0 && (
              <tbody>
                <tr>
                  <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: "none" }} />
                </tr>
              </tbody>
            )}
            {virtualRows.map((virtualRow) => {
              const index = virtualRow.index

              if (index >= data.length) {
                const skeletonIndex = index - data.length
                return (
                  <tbody
                    key={`skeleton-${skeletonIndex}`}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    <tr className="bg-secondary" style={{ opacity: 1 - skeletonIndex / SKELETON_ROW_COUNT }}>
                      <td colSpan={colCount} className="h-9" />
                    </tr>
                  </tbody>
                )
              }

              const row = data[index]
              const rowKey = rowKeys[index]
              if (!row || rowKey === undefined) return null

              const isExpanded = expandedRowKeys?.has(rowKey) ?? false
              const expanded = isExpanded && getExpandedRows ? getExpandedRows(row) : undefined
              const isActive = activeRowKey === rowKey

              return (
                <tbody key={rowKey} ref={virtualizer.measureElement} data-index={virtualRow.index}>
                  <DataRow
                    row={row}
                    rowKey={rowKey}
                    columns={columns}
                    {...(() => {
                      const rowClassName = getRowClassName?.(row, { isActive, isExpanded, isSubRow: false })
                      return rowClassName ? { rowClassName } : {}
                    })()}
                    hasSelection={!!selection}
                    hasExpansion={hasExpansion}
                    isExpandable={hasExpansion}
                    isExpanded={isExpanded}
                    isActive={isActive}
                    {...(selection
                      ? {
                          checkedState: selection.getCheckedState?.(rowKey) ?? selection.isSelected(rowKey),
                          onToggleRow: selection.toggleRow,
                        }
                      : {})}
                    {...(onRowClick
                      ? {
                          onClick: onRowClick,
                          rowInteractionRole,
                          ...(getRowAriaLabel ? { rowAriaLabel: getRowAriaLabel(row) } : {}),
                        }
                      : {})}
                    dataIndex={virtualRow.index}
                  />
                  {expanded?.isLoading &&
                    Array.from({ length: EXPANDED_SKELETON_COUNT }).map((_, i) => (
                      <tr key={`exp-skel-${i}`} style={{ opacity: 1 - i / EXPANDED_SKELETON_COUNT }}>
                        <td colSpan={colCount} className="h-9" />
                      </tr>
                    ))}
                  {expanded &&
                    !expanded.isLoading &&
                    expanded.data.map((subRow) => {
                      const subKey = getRowKey(subRow)
                      return (
                        <DataRow
                          key={subKey}
                          row={subRow}
                          rowKey={subKey}
                          columns={columns}
                          {...(() => {
                            const rowClassName = getRowClassName?.(subRow, {
                              isActive: activeRowKey === subKey,
                              isExpanded: false,
                              isSubRow: true,
                            })
                            return rowClassName ? { rowClassName } : {}
                          })()}
                          hasSelection={!!selection}
                          hasExpansion={hasExpansion}
                          isActive={activeRowKey === subKey}
                          {...(selection
                            ? {
                                checkedState: selection.getCheckedState?.(subKey) ?? selection.isSelected(subKey),
                                onToggleRow: selection.toggleRow,
                              }
                            : {})}
                          {...(onRowClick
                            ? {
                                onClick: onRowClick,
                                rowInteractionRole,
                                ...(getRowAriaLabel ? { rowAriaLabel: getRowAriaLabel(subRow) } : {}),
                              }
                            : {})}
                          dataIndex={virtualRow.index}
                          isSubRow
                        />
                      )
                    })}
                  {isExpanded && (
                    <tr>
                      <td colSpan={colCount} className="h-px p-0 border-t border-border pb-2" />
                    </tr>
                  )}
                </tbody>
              )
            })}
            {paddingBottom > 0 && (
              <tbody>
                <tr>
                  <td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: "none" }} />
                </tr>
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
