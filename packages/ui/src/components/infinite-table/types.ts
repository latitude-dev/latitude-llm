import type { ReactNode } from "react"
import type { SortDirection } from "../../utils/filtersHelpers.ts"
import type { CheckedState } from "../checkbox/checkbox.tsx"

export interface InfiniteTableColumn<T> {
  key: string
  header: string
  /**
   * Optional tooltip content shown when hovering the header label. Useful for
   * explaining why an aggregate is omitted, what a unit means, etc.
   */
  headerTooltip?: ReactNode
  /** `rowIndex` is the zero-based position of the row in the current `data` array (stable across virtualized windows). */
  render: (row: T, rowIndex: number) => ReactNode
  align?: "start" | "end"
  resizable?: boolean
  /** Minimum width (px); used for resize limits and header measurement. */
  minWidth?: number
  /** Preferred starting width (px) for the first layout lock; the column can later be resized smaller. */
  width?: number
  /** Maximum width (px); when set equal to `width`, the column stays fixed. */
  maxWidth?: number
  sortKey?: string
  /** Optional second header row cell; use for summaries. Keep controls `stopPropagation` if the column is sortable. */
  renderSubheader?: (column: InfiniteTableColumn<T>, columnIndex: number) => ReactNode
  /** Whether to apply text ellipsis overflow on the cell. Defaults to `true`. */
  ellipsis?: boolean
  /** Optional className applied to each body cell for this column. */
  cellClassName?: string
}

export interface InfiniteTableSelection {
  headerState: CheckedState
  isSelected: (key: string) => boolean
  getCheckedState?: (key: string) => CheckedState
  toggleRow: (key: string, checked: CheckedState, options?: { shiftKey?: boolean }) => void
  toggleAll: () => void
}

export interface InfiniteTableInfiniteScroll {
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}

export interface InfiniteTableSorting {
  column: string
  direction: SortDirection
}

export interface ExpandedRows<T> {
  data: readonly T[]
  isLoading?: boolean
}

export interface InfiniteTableSharedProps<T> {
  data: readonly T[]
  isLoading?: boolean
  columns: InfiniteTableColumn<T>[]
  getRowKey: (row: T) => string
  getRowClassName?: (
    row: T,
    context: {
      isActive: boolean
      isExpanded: boolean
      isSubRow: boolean
    },
  ) => string | undefined
  activeRowKey?: string
  activeRowAutoScroll?: boolean
  selection?: InfiniteTableSelection
  infiniteScroll?: InfiniteTableInfiniteScroll
  sorting?: InfiniteTableSorting
  defaultSorting?: InfiniteTableSorting
  onSortChange?: (sorting: InfiniteTableSorting) => void
  blankSlate?: ReactNode | string
  /** `fill` (default) stretches in a fixed parent; `intrinsic` sizes to content up to scroll `className` max-height. */
  scrollAreaLayout?: "fill" | "intrinsic"
  className?: string
  expandedRowKeys?: ReadonlySet<string>
  getExpandedRows?: (row: T) => ExpandedRows<T>
}

export type InfiniteTableProps<T> =
  | (InfiniteTableSharedProps<T> & {
      onRowClick: (row: T) => void
      getRowAriaLabel: (row: T) => string
      /** Semantic role for clickable rows (`link` when the action navigates). Defaults to `button`. */
      rowInteractionRole?: "button" | "link"
    })
  | (InfiniteTableSharedProps<T> & {
      onRowClick?: undefined
      getRowAriaLabel?: undefined
      rowInteractionRole?: undefined
    })
