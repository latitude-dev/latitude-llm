import { ChevronsUpDown } from "lucide-react"
import type { HTMLAttributes, Ref, TdHTMLAttributes, ThHTMLAttributes } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"

function DataTableRoot({ ref, className, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col w-full rounded-lg border border-border overflow-hidden", className)}
      data-slot="data-table-root"
      {...props}
    />
  )
}

function DataTableTable({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableElement> & { ref?: Ref<HTMLTableElement> }) {
  return (
    <table
      ref={ref}
      className={cn("w-full min-w-full border-collapse caption-bottom text-sm", className)}
      data-slot="data-table-table"
      {...props}
    />
  )
}

function DataTableHeader({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & { ref?: Ref<HTMLTableSectionElement> }) {
  return (
    <thead ref={ref} className={cn("border-b border-border", className)} data-slot="data-table-header" {...props} />
  )
}

function DataTableBody({
  ref,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & { ref?: Ref<HTMLTableSectionElement> }) {
  return <tbody ref={ref} className={cn("", className)} data-slot="data-table-body" {...props} />
}

type DataTableHeaderRowProps = HTMLAttributes<HTMLTableRowElement> & { ref?: Ref<HTMLTableRowElement> }
function DataTableHeaderRow({ ref, className, ...props }: DataTableHeaderRowProps) {
  return (
    <tr ref={ref} className={cn("border-b border-border", className)} data-slot="data-table-header-row" {...props} />
  )
}

export type SortDirection = "asc" | "desc" | undefined

type DataTableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  ref?: Ref<HTMLTableCellElement>
  /** Column alignment; Figma uses right for index and numeric columns */
  align?: "left" | "center" | "right"
  /** When true, renders a sort trigger and shows direction */
  sortable?: boolean
  sortDirection?: SortDirection
  onSort?: () => void
  /** Fixed width for index column (Figma: 48px) */
  indexColumn?: boolean
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
  ...props
}: DataTableHeaderCellProps) {
  const content = (
    <span className="inline-flex flex-row items-center gap-2">
      {typeof children === "string" ? (
        <Text.H6 weight="medium" color="foregroundMuted">
          {children}
        </Text.H6>
      ) : (
        children
      )}
      {sortable && (
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
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 align-middle font-medium",
        indexColumn && "w-12 min-w-12 max-w-12 text-center",
        align === "left" && "text-left",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
      data-slot="data-table-header-cell"
      {...props}
    >
      {content}
    </th>
  )
}

type DataTableRowProps = HTMLAttributes<HTMLTableRowElement> & { ref?: Ref<HTMLTableRowElement> }

function DataTableRow({ ref, className, ...props }: DataTableRowProps) {
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border transition-colors last:border-b-0",
        "bg-secondary",
        "hover:bg-secondary/80",
        className,
      )}
      data-slot="data-table-row"
      {...props}
    />
  )
}

type DataTableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  ref?: Ref<HTMLTableCellElement>
  align?: "left" | "center" | "right"
  /** Index column cell (fixed 48px, centered); use with DataTableHeaderCell indexColumn */
  indexColumn?: boolean
}

function DataTableCell({
  ref,
  className,
  children,
  align = "left",
  indexColumn = false,
  ...props
}: DataTableCellProps) {
  return (
    <td
      ref={ref}
      className={cn(
        "h-8 px-4 align-middle max-w-60",
        font.size.h5,
        indexColumn && "w-12 min-w-12 max-w-12 text-center",
        align === "left" && "text-left",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
      data-slot="data-table-cell"
      {...props}
    >
      {children}
    </td>
  )
}

export {
  DataTableRoot,
  DataTableTable,
  DataTableHeader,
  DataTableBody,
  DataTableHeaderRow,
  DataTableHeaderCell,
  DataTableRow,
  DataTableCell,
}
