import { cn, Icon, TableHead, Text, Tooltip } from "@repo/ui"
import { ArrowDown01, ArrowDownAZ, ArrowUp01, ArrowUpAZ } from "lucide-react"

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
}: {
  readonly column: TColumn
  readonly label: string
  readonly align: "left" | "right"
  readonly isFirst: boolean
  /** Ranks A-Z rather than 0-9, which is only right for a name column. */
  readonly alphabetical?: boolean
  readonly sort: { readonly column: TColumn; readonly direction: "asc" | "desc" }
  readonly onSort: (column: TColumn) => void
  readonly tooltipMessage?: string
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
      className={cn("bg-transparent", { "border-l border-border": !isFirst })}
      aria-sort={isActive ? (isAscending ? "ascending" : "descending") : "none"}
    >
      {tooltipMessage ? (
        <Tooltip asChild trigger={trigger}>
          {tooltipMessage}
        </Tooltip>
      ) : (
        trigger
      )}
    </TableHead>
  )
}
