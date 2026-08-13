import { cn, Icon, TableHead, Text, Tooltip } from "@repo/ui"
import { ArrowDown01, ArrowDownAZ, ArrowUp01, ArrowUpAZ } from "lucide-react"
import type { ReactNode } from "react"

/**
 * A column's aggregate, shown under its header — the same place the sessions/traces
 * table shows a rollup, so a summed column reads the same way everywhere instead of
 * this table inventing its own separate totals row.
 */
export function HeaderSummary({ kind, value }: { readonly kind: "SUM" | "AVG"; readonly value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span className="shrink-0 text-xs leading-4 font-medium text-muted-foreground tabular-nums">{kind}</span>
      <span className="shrink-0 text-xs leading-4 font-semibold text-foreground tabular-nums">{value}</span>
    </span>
  )
}

/**
 * A sortable header cell for the cost section's tables.
 *
 * Shared so the tables cannot drift apart on spacing, borders or sort affordance. The
 * left border on every cell but the first draws the column rules, so a table that
 * hand-rolls its headers tends to lose them on one column and keep them on the rest.
 */
export function CostTableHead<TColumn extends string>({
  column,
  label,
  align,
  isFirst,
  alphabetical = false,
  sort,
  onSort,
  tooltipMessage,
  summary,
  className,
}: {
  readonly column: TColumn
  readonly label: string
  readonly align: "left" | "right"
  readonly isFirst: boolean
  /** For a column whose width auto-layout gets wrong, such as one holding a bar. */
  readonly className?: string
  /** Ranks A-Z rather than 0-9, which is only right for a name column. */
  readonly alphabetical?: boolean
  readonly sort: { readonly column: TColumn; readonly direction: "asc" | "desc" }
  readonly onSort: (column: TColumn) => void
  readonly tooltipMessage?: string
  /** The column's aggregate, e.g. a `HeaderSummary` — omitted for columns with nothing to sum. */
  readonly summary?: ReactNode
}) {
  const isActive = sort.column === column
  const isAscending = isActive && sort.direction === "asc"
  const icon = alphabetical ? (isAscending ? ArrowUpAZ : ArrowDownAZ) : isAscending ? ArrowUp01 : ArrowDown01

  const trigger = (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}`}
      className={cn("group flex cursor-pointer flex-row items-center gap-1.5", {
        "flex-row-reverse": align === "left",
      })}
    >
      <Icon icon={icon} size="sm" color={isActive ? "foreground" : "foregroundMuted"} />
      <Text.H5M color={isActive ? "foreground" : "foregroundMuted"} noWrap>
        {label}
      </Text.H5M>
    </button>
  )

  return (
    <TableHead
      align={align}
      className={cn("bg-transparent", { "border-l border-border": !isFirst }, className)}
      aria-sort={isActive ? (isAscending ? "ascending" : "descending") : "none"}
    >
      <div className="flex flex-col gap-1">
        {tooltipMessage ? (
          <Tooltip asChild trigger={trigger}>
            {tooltipMessage}
          </Tooltip>
        ) : (
          trigger
        )}
        {summary ? (
          <div className={cn("flex", align === "right" ? "justify-end" : "justify-start")}>{summary}</div>
        ) : null}
      </div>
    </TableHead>
  )
}
