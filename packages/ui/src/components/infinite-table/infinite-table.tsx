import { useVirtualizer } from "@tanstack/react-virtual"
import { InfoIcon } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../utils/cn.ts"
import type { SortDirection } from "../../utils/filtersHelpers.ts"
import { Checkbox } from "../checkbox/checkbox.tsx"
import { Icon } from "../icons/icons.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { DataRow } from "./data-row.tsx"
import { buildDisplayRows, type DisplayRow } from "./display-rows.ts"
import { HeaderCell } from "./headers/header-cell.tsx"
import type { InfiniteTableColumn, InfiniteTableProps } from "./types.ts"
import { useHeaderLayoutLock } from "./use-header-layout-lock.ts"

const ROW_HEIGHT = 40
const GROUP_HEADER_ROW_HEIGHT = 36
const SKELETON_ROW_COUNT = 8
const EXPANDED_SKELETON_COUNT = 3
const SELECTION_COLUMN_WIDTH = 48

const EXPANDED_SKELETON_CELL_CLASS =
  "px-4 py-2 first:rounded-l-lg last:rounded-r-lg overflow-hidden align-middle text-sm leading-5"

function renderExpandedSkeletonRows<T>(
  columns: readonly InfiniteTableColumn<T>[],
  hasExpansion: boolean,
  hasSelection: boolean,
) {
  return Array.from({ length: EXPANDED_SKELETON_COUNT }, (_, i) => (
    <tr key={`exp-skel-${i}`} className="bg-secondary" style={{ opacity: 1 - i / EXPANDED_SKELETON_COUNT }}>
      {hasExpansion && <td className="w-8 px-2 py-2" />}
      {hasSelection && (
        <td
          style={{ width: SELECTION_COLUMN_WIDTH, minWidth: SELECTION_COLUMN_WIDTH, maxWidth: SELECTION_COLUMN_WIDTH }}
          className={EXPANDED_SKELETON_CELL_CLASS}
        >
          <Skeleton className="h-4 w-4" />
        </td>
      )}
      {columns.map((col) => (
        <td key={col.key} className={EXPANDED_SKELETON_CELL_CLASS}>
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  ))
}

function renderBlankSlateMessage(message: string, compact = false) {
  return (
    <div
      className={cn(
        "rounded-lg w-full flex flex-col gap-4 items-center justify-center bg-linear-to-b from-secondary to-transparent px-4",
        compact ? "py-8" : "py-40",
      )}
    >
      <Text.H5 align="center" display="block" color="foregroundMuted">
        {message}
      </Text.H5>
    </div>
  )
}

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
  renderRowLink,
  activeRowKey,
  activeRowAutoScroll = false,
  selection,
  infiniteScroll,
  sorting,
  defaultSorting,
  onSortChange,
  blankSlate,
  scrollAreaLayout = "fill",
  scrollContainerRef: externalScrollContainerRef,
  className,
  expandedRowKeys,
  getExpandedRows,
  isRowExpandable,
  onToggleExpand,
  hideExpandedRowSeparator = false,
  getRowGroup,
  renderGroupHeader,
  groupOrder,
}: InfiniteTableProps<T>) {
  const hasExpansion = !!expandedRowKeys && !!getExpandedRows
  const colCount = columns.length + (selection ? 1 : 0) + (hasExpansion ? 1 : 0)
  const hasSubheaderRow = useMemo(() => columns.some((col) => col.renderSubheader != null), [columns])
  const hasMore = infiniteScroll?.hasMore ?? false

  const hasGrouping = !!getRowGroup && !!renderGroupHeader
  const displayRows = useMemo<readonly DisplayRow[]>(
    () => buildDisplayRows(data, getRowGroup, hasGrouping, groupOrder),
    [data, getRowGroup, hasGrouping, groupOrder],
  )

  const totalVirtualRows = displayRows.length + (hasMore || (isLoading && data.length === 0) ? SKELETON_ROW_COUNT : 0)

  const isExternalScrollArea = scrollAreaLayout === "external"
  const ownScrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef =
    isExternalScrollArea && externalScrollContainerRef ? externalScrollContainerRef : ownScrollContainerRef
  const tableWrapperRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // Group headers are pinned to the visible viewport on both axes: in-flow
  // header rows get an explicit `clientWidth` + sticky-left wrapper (so they
  // don't scroll away horizontally with the table), and the active group's
  // header is mirrored in a sticky overlay below the thead while its own row
  // is scrolled out of view.
  const [containerWidth, setContainerWidth] = useState(0)
  const [theadHeight, setTheadHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)

  useLayoutEffect(() => {
    if (!hasGrouping) return
    const container = scrollContainerRef.current
    if (!container) return

    const measure = () => {
      setContainerWidth(container.clientWidth)
      setTheadHeight(theadRef.current?.offsetHeight ?? 0)
    }
    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(container)
    if (theadRef.current) resizeObserver.observe(theadRef.current)
    return () => resizeObserver.disconnect()
  }, [hasGrouping])

  // The virtualizer's row math is relative to the scroll container's own top, but in
  // external mode that container also holds content above the table (e.g. a chart).
  // scrollMargin tells it how far down the table's own start actually sits.
  useLayoutEffect(() => {
    if (!isExternalScrollArea) return
    const container = scrollContainerRef.current
    const wrapper = tableWrapperRef.current
    if (!container || !wrapper) return

    const measure = () => {
      const wrapperRect = wrapper.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      setScrollMargin(wrapperRect.top - containerRect.top + container.scrollTop)
    }
    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(container)
    resizeObserver.observe(wrapper)
    return () => resizeObserver.disconnect()
  }, [isExternalScrollArea, scrollContainerRef])

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

  const rowKeys = useMemo(() => data.map(getRowKey), [data, getRowKey])

  // Identity-stable keys (not the array index) so measured row heights survive
  // page growth and reorders during infinite scroll; index-keyed measurements
  // get mis-attributed when displayRows shifts, painting rows/headers at stale
  // offsets (empty/duplicated group headers).
  const virtualizer = useVirtualizer({
    count: totalVirtualRows,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => (displayRows[index]?.kind === "group" ? GROUP_HEADER_ROW_HEIGHT : ROW_HEIGHT),
    getItemKey: (index) => {
      if (index >= displayRows.length) return `skeleton-${index - displayRows.length}`
      const displayRow = displayRows[index]
      if (!displayRow) return `empty-${index}`
      return displayRow.kind === "group" ? `group-${displayRow.groupKey}` : `row-${rowKeys[displayRow.dataIndex]}`
    },
    overscan: 10,
    ...(isExternalScrollArea ? { scrollMargin } : {}),
  })

  const handleScrollElement = useCallback(
    (target: HTMLDivElement) => {
      // Tracked in state (not read from the virtualizer) so the sticky
      // group-header overlay re-evaluates on every scroll tick, not only
      // when the virtual window shifts.
      if (hasGrouping) setScrollTop(target.scrollTop)
      if (!infiniteScroll || !hasMore || infiniteScroll.isLoadingMore) return
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
      if (distanceToBottom < ROW_HEIGHT * 5) {
        infiniteScroll.onLoadMore()
      }
    },
    [infiniteScroll, hasMore, hasGrouping],
  )

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => handleScrollElement(e.currentTarget),
    [handleScrollElement],
  )

  // In external mode the scroll container belongs to the caller, so there's no
  // owned element to attach the `onScroll` JSX prop to — listen natively instead.
  useEffect(() => {
    if (!isExternalScrollArea) return
    const container = scrollContainerRef.current
    if (!container) return
    const listener = () => handleScrollElement(container)
    container.addEventListener("scroll", listener, { passive: true })
    return () => container.removeEventListener("scroll", listener)
  }, [isExternalScrollArea, handleScrollElement, scrollContainerRef])

  const virtualRows = virtualizer.getVirtualItems()

  // Group key mirrored in the sticky overlay: the group of the first row
  // visible below the thead. `null` (overlay hidden) while that first row is
  // the group's own in-flow header, so the header never shows twice — the
  // overlay takes over exactly when the real header scrolls out the top, and
  // yields just before the next group's header reaches the sticky line.
  const stickyGroupKey = useMemo(() => {
    if (!hasGrouping || !getRowGroup) return null
    const firstVisible = virtualRows.find((row) => row.index < displayRows.length && row.end > scrollTop)
    if (!firstVisible) return null
    const displayRow = displayRows[firstVisible.index]
    if (!displayRow || displayRow.kind !== "data") return null
    const dataRow = data[displayRow.dataIndex]
    return dataRow === undefined ? null : getRowGroup(dataRow)
  }, [data, displayRows, getRowGroup, hasGrouping, scrollTop, virtualRows])

  const activeRowIndex = useMemo(() => {
    if (activeRowKey == null || activeRowKey === "") return -1

    const directIndex = data.findIndex((row) => getRowKey(row) === activeRowKey)
    if (directIndex >= 0) return directIndex

    if (!getExpandedRows) return -1
    return data.findIndex((row) => getExpandedRows(row).data.some((subRow) => getRowKey(subRow) === activeRowKey))
  }, [activeRowKey, data, getExpandedRows, getRowKey])

  // The virtualizer indexes display rows (group headers included), so the
  // active DATA index must be translated before scroll-to-row.
  const activeDisplayIndex = useMemo(() => {
    if (activeRowIndex < 0) return -1
    return displayRows.findIndex((displayRow) => displayRow.kind === "data" && displayRow.dataIndex === activeRowIndex)
  }, [activeRowIndex, displayRows])

  const { tableRef, layoutFixed } = useHeaderLayoutLock({
    columns,
    hasSelection: !!selection,
    hasExpansion,
    hasSubheaderRow,
    containerRef: scrollContainerRef,
  })

  useLayoutEffect(() => {
    if (!activeRowAutoScroll || activeDisplayIndex < 0) return

    const scrollActiveRowIntoView = () => {
      virtualizer.scrollToIndex(activeDisplayIndex, {
        align: "center",
        behavior: "instant",
      })
    }

    scrollActiveRowIntoView()
    const rafId = requestAnimationFrame(scrollActiveRowIntoView)
    return () => cancelAnimationFrame(rafId)
  }, [activeRowAutoScroll, activeRowIndex, virtualizer])

  // In external mode `virtualRow.start`/`.end` are measured from the scroll
  // container's own origin, so they already bake in `scrollMargin` (the space the
  // table's preceding in-flow siblings occupy there). The `paddingTop` spacer lives
  // inside the table itself though, which is already positioned past that content by
  // normal document flow — so `scrollMargin` must be subtracted back out, or that
  // offset gets counted twice, opening a gap above the first row equal to its size.
  const paddingTop = (virtualRows[0]?.start ?? 0) - (isExternalScrollArea ? scrollMargin : 0)
  const lastRow = virtualRows[virtualRows.length - 1]
  // `getTotalSize()` subtracts `scrollMargin` back out internally (it describes the
  // list's own size, not its offset within the scroll container), while `lastRow.end`
  // still includes it — add it back so the two are comparable, mirroring `paddingTop`.
  const paddingBottom = lastRow
    ? virtualizer.getTotalSize() + (isExternalScrollArea ? scrollMargin : 0) - lastRow.end
    : 0
  const showBlankSlate = !isLoading && data.length === 0
  const blankSlateContent =
    showBlankSlate && blankSlate !== undefined
      ? typeof blankSlate === "string"
        ? renderBlankSlateMessage(blankSlate)
        : blankSlate
      : null
  return (
    <div className={cn("flex flex-col min-h-0", scrollAreaLayout === "fill" ? "flex-1" : "w-full max-w-full")}>
      {blankSlateContent ? (
        blankSlateContent
      ) : (
        <div
          ref={isExternalScrollArea ? tableWrapperRef : scrollContainerRef}
          {...(isExternalScrollArea ? {} : { onScroll: handleScroll })}
          className={
            isExternalScrollArea
              ? cn("w-full max-w-full", className)
              : cn(
                  scrollAreaLayout === "fill" ? "min-h-0 flex-1" : "min-h-0 w-full max-w-full",
                  "overflow-auto",
                  className,
                )
          }
        >
          {/* Sticky mirror of the active group's header. A zero-height sticky
              box pinned below the thead (and to the container's left edge, so
              horizontal scrolling never moves it); the inner div paints an
              opaque background so rows slide underneath. Rendered as a sibling
              of the table because a sticky cell can't escape its own single-row
              tbody and the virtualizer unmounts off-screen header rows. */}
          {hasGrouping && stickyGroupKey !== null && containerWidth > 0 && (
            <div className="sticky left-0 z-[5]" style={{ top: theadHeight, height: 0, width: containerWidth }}>
              <div className="bg-background">{renderGroupHeader?.(stickyGroupKey)}</div>
            </div>
          )}
          <table
            ref={tableRef}
            className={cn("min-w-full border-separate border-spacing-y-1", { "table-fixed": layoutFixed })}
          >
            <thead ref={theadRef} className="sticky top-0 z-10 border-b border-border bg-background">
              <tr>
                {hasExpansion && <HeaderCell resizable={false} className="w-8" showSubheaderSlot={hasSubheaderRow} />}
                {selection && (
                  <HeaderCell
                    resizable={false}
                    width={SELECTION_COLUMN_WIDTH}
                    minWidth={SELECTION_COLUMN_WIDTH}
                    maxWidth={SELECTION_COLUMN_WIDTH}
                    showSubheaderSlot={hasSubheaderRow}
                  >
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
                      {...(col.maxWidth !== undefined ? { maxWidth: col.maxWidth } : {})}
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

              if (index >= displayRows.length) {
                const skeletonIndex = index - displayRows.length
                return (
                  <tbody
                    key={`skeleton-${skeletonIndex}`}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    <tr style={{ opacity: 1 - skeletonIndex / SKELETON_ROW_COUNT }}>
                      {/* Background+radius on the <td>, not the <tr>: a row box can't clip its corners. */}
                      <td colSpan={colCount} className="h-9 rounded-lg bg-secondary" />
                    </tr>
                  </tbody>
                )
              }

              const displayRow = displayRows[index]
              if (!displayRow) return null

              if (displayRow.kind === "group") {
                // Group header: a single full-width cell — no checkbox, no
                // DataRow, no row link/click — so selection and navigation
                // semantics never see it. The inner wrapper is sticky-left at
                // the container's clientWidth so the header spans the visible
                // viewport and stays put while the columns scroll under it.
                return (
                  <tbody key={`group-${displayRow.groupKey}`} ref={virtualizer.measureElement} data-index={index}>
                    <tr>
                      <td colSpan={colCount} className="p-0 border-none">
                        <div
                          className="sticky left-0"
                          style={containerWidth > 0 ? { width: containerWidth } : undefined}
                        >
                          {renderGroupHeader?.(displayRow.groupKey)}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                )
              }

              const row = data[displayRow.dataIndex]
              const rowKey = rowKeys[displayRow.dataIndex]
              if (!row || rowKey === undefined) return null

              const canExpand = hasExpansion && (isRowExpandable ? isRowExpandable(row) : true)
              const isExpanded = canExpand && (expandedRowKeys?.has(rowKey) ?? false)
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
                    isExpandable={canExpand}
                    isExpanded={isExpanded}
                    isActive={isActive}
                    {...(onToggleExpand ? { onToggleExpand } : {})}
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
                    {...(renderRowLink ? { renderRowLink } : {})}
                    dataIndex={displayRow.dataIndex}
                  />
                  {expanded?.isLoading && renderExpandedSkeletonRows(columns, hasExpansion, !!selection)}
                  {expanded &&
                    !expanded.isLoading &&
                    expanded.data.length === 0 &&
                    expanded.blankSlate !== undefined && (
                      <tr>
                        <td colSpan={colCount} className="p-0 border-none">
                          {typeof expanded.blankSlate === "string"
                            ? renderBlankSlateMessage(expanded.blankSlate, true)
                            : expanded.blankSlate}
                        </td>
                      </tr>
                    )}
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
                          {...(renderRowLink ? { renderRowLink } : {})}
                          dataIndex={displayRow.dataIndex}
                          isSubRow
                        />
                      )
                    })}
                  {isExpanded && expanded && !expanded.isLoading && expanded.header !== undefined && (
                    <tr>
                      {hasExpansion && <td className="px-2 py-2 w-8 border-none" />}
                      {selection && (
                        <td style={{ width: 48, minWidth: 48, maxWidth: 48 }} className="px-4 py-2 border-none" />
                      )}
                      <td colSpan={colCount - (hasExpansion ? 1 : 0) - (selection ? 1 : 0)} className="p-0 border-none">
                        {expanded.header}
                      </td>
                    </tr>
                  )}
                  {isExpanded &&
                    expanded &&
                    !expanded.isLoading &&
                    expanded.data.length > 0 &&
                    !hideExpandedRowSeparator && (
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
