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
  /** Shown when expanded data finished loading and `data` is empty. */
  blankSlate?: ReactNode | string
  /**
   * Rendered below the expanded `data` rows (when present and not loading).
   * Spans the table width via `colSpan` for pagination and expansion controls.
   */
  header?: ReactNode
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
  /**
   * Per-row guard for the expand affordance. When provided and returning `false`,
   * the row renders without a chevron and without `aria-expanded`. The table-level
   * expand column still reserves its slot so columns stay aligned across rows.
   * Defaults to "every top-level row is expandable" when expansion is enabled.
   */
  isRowExpandable?: (row: T) => boolean
  /**
   * When provided, the expand chevron becomes an independent control: clicking
   * it toggles expansion (the caller flips `expandedRowKeys`) without firing
   * `onRowClick`, so a row can both expand inline and open a detail surface on
   * row-body click. When omitted, expansion is driven by `onRowClick` as before.
   */
  onToggleExpand?: (row: T) => void
  /** Hide the horizontal separator rendered after expanded sub-rows. */
  hideExpandedRowSeparator?: boolean
  /**
   * Stable group key per row. Rows are bucketed by key into one contiguous
   * section per group (header rendered by `renderGroupHeader`), so `data` need
   * not arrive grouped. Headers live outside the data array: they are not
   * selectable, not clickable, and invisible to `getRowKey`/selection. Requires
   * `renderGroupHeader`.
   *
   * Headers are viewport-pinned on both axes: they render at the container's
   * visible width and stick to its left edge under horizontal scrolling, and
   * the active group's header is mirrored in a sticky overlay below the thead
   * while its own row is scrolled out of view (so the current group stays
   * labelled). Header content should therefore tolerate an opaque
   * `bg-background` behind it when pinned.
   */
  getRowGroup?: (row: T) => string
  /** Renders the content of an injected group header row (see `getRowGroup`). */
  renderGroupHeader?: (groupKey: string) => ReactNode
  /**
   * Fixed section order for grouping. Sections render in this order regardless
   * of where each group first appears in `data`; row order *within* a section
   * still follows `data`. Groups present in `data` but absent here render last,
   * in first-appearance order. Without it, sections follow first-appearance.
   */
  groupOrder?: readonly string[]
}

export type InfiniteTableProps<T> =
  | (InfiniteTableSharedProps<T> & {
      onRowClick: (row: T) => void
      getRowAriaLabel: (row: T) => string
      /** Semantic role for clickable rows (`link` when the action navigates). Defaults to `button`. */
      rowInteractionRole?: "button" | "link"
      renderRowLink?: undefined
    })
  | (InfiniteTableSharedProps<T> & {
      /**
       * Render a real anchor for navigation rows (router-agnostic — the app provides the element).
       * The `props.className` must be spread onto the anchor to apply the stretched-link overlay.
       * Use this instead of `onRowClick` whenever clicking navigates to a different page.
       *
       * @example
       * renderRowLink={(row, props) => (
       *   <Link to="/items/$id" params={{ id: row.id }} {...props} aria-label={`Open ${row.name}`} />
       * )}
       */
      renderRowLink: (row: T, props: { className: string }) => ReactNode
      onRowClick?: undefined
      getRowAriaLabel?: undefined
      rowInteractionRole?: undefined
    })
  | (InfiniteTableSharedProps<T> & {
      onRowClick?: undefined
      getRowAriaLabel?: undefined
      rowInteractionRole?: undefined
      renderRowLink?: undefined
    })
