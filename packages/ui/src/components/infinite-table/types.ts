import type { SortDirection as DomainSortDirection } from "@domain/shared"
import type { ReactNode } from "react"
import type { CheckedState } from "../checkbox/checkbox.tsx"

export type SortDirection = DomainSortDirection

export interface InfiniteTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  resizable?: boolean
  minWidth?: number
  sortKey?: string
}

export interface InfiniteTableSelection {
  headerState: CheckedState
  isSelected: (key: string) => boolean
  toggleRow: (key: string, checked: CheckedState) => void
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

export interface InfiniteTableProps<T> {
  data: readonly T[]
  isLoading?: boolean
  columns: InfiniteTableColumn<T>[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  activeRowKey?: string
  selection?: InfiniteTableSelection
  infiniteScroll?: InfiniteTableInfiniteScroll
  sorting?: InfiniteTableSorting
  defaultSorting?: InfiniteTableSorting
  onSortChange?: (sorting: InfiniteTableSorting) => void
  blankSlate?: ReactNode | string
  className?: string
}
