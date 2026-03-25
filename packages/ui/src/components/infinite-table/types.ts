import type { ReactNode } from "react"
import type { SortDirection } from "../../utils/filtersHelpers.ts"
import type { CheckedState } from "../checkbox/checkbox.tsx"

export interface InfiniteTableColumn<T> {
  key: string
  header: string
  /** `rowIndex` is the zero-based position of the row in the current `data` array (stable across virtualized windows). */
  render: (row: T, rowIndex: number) => ReactNode
  align?: "start" | "end"
  resizable?: boolean
  minWidth?: number
  sortKey?: string
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

export interface InfiniteTableProps<T> {
  data: readonly T[]
  isLoading?: boolean
  columns: InfiniteTableColumn<T>[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  activeRowKey?: string
  activeRowAutoScroll?: boolean
  selection?: InfiniteTableSelection
  infiniteScroll?: InfiniteTableInfiniteScroll
  sorting?: InfiniteTableSorting
  defaultSorting?: InfiniteTableSorting
  onSortChange?: (sorting: InfiniteTableSorting) => void
  blankSlate?: ReactNode | string
  className?: string
  expandedRowKeys?: ReadonlySet<string>
  getExpandedRows?: (row: T) => ExpandedRows<T>
}
