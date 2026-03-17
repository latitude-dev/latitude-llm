import { ChevronsUpDown } from "lucide-react"
import type { HTMLAttributes, Ref } from "react"

import { cn } from "../../utils/cn.ts"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"

/** Div-based layout for virtualization. Figma: column, gap 4px, no border on container. */
function DataTableRoot({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col w-full gap-1", className)}
      data-slot="data-table-root"
      {...props}
    />
  )
}

/** Sticky header wrapper. Figma: border-b only, no background. */
function DataTableHeader({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("flex shrink-0 flex-col border-b border-border", className)}
      data-slot="data-table-header"
      {...props}
    />
  )
}

/** Scrollable body; use for virtualized or mapped rows. */
function DataTableBody({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-1 flex-col min-h-0 overflow-auto gap-1", className)}
      data-slot="data-table-body"
      {...props}
    />
  )
}

/** Figma: header row, 48px height, 16px padding per cell, 32px gap between columns. */
function DataTableHeaderRow({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-row items-center h-12 gap-8", className)}
      data-slot="data-table-header-row"
      role="row"
      {...props}
    />
  )
}

export type SortDirection = "asc" | "desc" | undefined

type DataTableHeaderCellProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>
  align?: "left" | "center" | "right"
  /** When true, shows sort trigger; use with sortDirection and onSort. */
  sortable?: boolean
  sortDirection?: SortDirection
  onSort?: () => void
  /** Index column: 48px wide (Figma). */
  indexColumn?: boolean
  /** Use for select-all checkbox column: narrow fixed width, centered. */
  checkboxColumn?: boolean
}

function DataTableHeaderCell({
  ref,
  className,
  children,
  align = "left",
  sortable = false,
  sortDirection,
  onSort,
  indexColumn = false,
  checkboxColumn = false,
  ...props
}: DataTableHeaderCellProps) {
  const isLabel = typeof children === "string"
  const content = (
    <span className="inline-flex min-w-0 flex-1 flex-row items-center gap-2">
      {isLabel ? (
        <Text.H6 color="foregroundMuted" weight="medium" ellipsis className="min-w-0">
          {children}
        </Text.H6>
      ) : (
        <span className="min-w-0 truncate">{children}</span>
      )}
      {sortable && isLabel && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-md"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSort?.()
          }}
          aria-label={
            sortDirection === "asc" ? "Sort ascending" : sortDirection === "desc" ? "Sort descending" : "Sort"
          }
        >
          <Icon
            icon={ChevronsUpDown}
            size="sm"
            className={cn(sortDirection === "asc" && "rotate-180", sortDirection === "desc" && "rotate-0")}
          />
        </Button>
      )}
    </span>
  )

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-row items-center shrink-0 px-4 border-r border-border last:border-r-0",
        indexColumn && "w-12 min-w-12 max-w-12 justify-center",
        checkboxColumn && "w-10 min-w-10 max-w-10 justify-center px-2",
        !indexColumn && !checkboxColumn && "flex-1 min-w-0",
        align === "left" && "justify-start",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
        className,
      )}
      data-slot="data-table-header-cell"
      role="columnheader"
      {...props}
    >
      {content}
    </div>
  )
}

/** Figma: body row, 32px height, 32px gap between cells, rounded-lg, bg secondary. */
function DataTableRow({ ref, className, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-row items-center gap-8 h-8 rounded-lg bg-secondary transition-colors hover:bg-secondary/80",
        className,
      )}
      data-slot="data-table-row"
      role="row"
      {...props}
    />
  )
}

type DataTableCellProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>
  align?: "left" | "center" | "right"
  indexColumn?: boolean
  /** Use for row checkbox column: narrow fixed width, centered. */
  checkboxColumn?: boolean
}

function DataTableCell({
  ref,
  className,
  children,
  align = "left",
  indexColumn = false,
  checkboxColumn = false,
  ...props
}: DataTableCellProps) {
  const isString = typeof children === "string"
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-row items-center shrink-0 overflow-hidden px-4 min-w-0",
        indexColumn && "w-12 min-w-12 max-w-12 justify-center",
        checkboxColumn && "w-10 min-w-10 max-w-10 justify-center px-2",
        !indexColumn && !checkboxColumn && "flex-1",
        align === "left" && "justify-start",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
        className,
      )}
      data-slot="data-table-cell"
      role="cell"
      {...props}
    >
      {isString ? (
        <Text.H5 ellipsis className="min-w-0">
          {children}
        </Text.H5>
      ) : (
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">{children}</span>
      )}
    </div>
  )
}

const DataTable = {
  Root: DataTableRoot,
  Header: DataTableHeader,
  HeaderRow: DataTableHeaderRow,
  HeaderCell: DataTableHeaderCell,
  Body: DataTableBody,
  Row: DataTableRow,
  Cell: DataTableCell,
}

export {
  DataTable,
  DataTableRoot,
  DataTableHeader,
  DataTableBody,
  DataTableHeaderRow,
  DataTableHeaderCell,
  DataTableRow,
  DataTableCell,
}
