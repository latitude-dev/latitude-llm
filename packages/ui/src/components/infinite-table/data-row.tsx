import { ChevronRight } from "lucide-react"
import { type KeyboardEvent, memo, useCallback } from "react"
import { cn } from "../../utils/cn.ts"
import { Checkbox, type CheckedState } from "../checkbox/checkbox.tsx"
import { Text } from "../text/text.tsx"
import type { InfiniteTableColumn } from "./types.ts"

interface DataRowProps<T> {
  row: T
  rowKey: string
  columns: InfiniteTableColumn<T>[]
  rowClassName?: string
  checkedState?: CheckedState
  isActive?: boolean
  onToggleRow?: (key: string, checked: CheckedState, options?: { shiftKey?: boolean }) => void
  hasSelection: boolean
  hasExpansion: boolean
  isExpandable?: boolean
  isExpanded?: boolean
  onClick?: (row: T) => void
  rowInteractionRole?: "button" | "link"
  rowAriaLabel?: string
  dataIndex: number
  isSubRow?: boolean
}

function DataRowInner<T>({
  row,
  rowKey,
  columns,
  rowClassName,
  checkedState,
  isActive,
  onToggleRow,
  hasSelection,
  hasExpansion,
  isExpandable,
  isExpanded,
  onClick,
  rowInteractionRole = "button",
  rowAriaLabel,
  dataIndex,
  isSubRow,
}: DataRowProps<T>) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onClick?.(row)
      }
    },
    [onClick, row],
  )

  const isClickable = Boolean(onClick)
  const interactiveRole = isClickable ? rowInteractionRole : undefined
  const isExpandToggleRow = Boolean(isClickable && isExpandable && !isSubRow)
  const ariaExpanded = isExpandToggleRow ? Boolean(isExpanded) : undefined
  const ariaPressed = isClickable && interactiveRole === "button" && !isExpandToggleRow ? Boolean(isActive) : undefined

  return (
    <tr
      data-index={dataIndex}
      role={interactiveRole}
      {...(isClickable && rowAriaLabel ? { "aria-label": rowAriaLabel } : {})}
      {...(ariaExpanded !== undefined ? { "aria-expanded": ariaExpanded } : {})}
      {...(ariaPressed !== undefined ? { "aria-pressed": ariaPressed } : {})}
      className={cn(
        {
          "bg-secondary": !isSubRow && !isExpanded,
          "bg-muted": isExpanded && !isActive,
          "bg-accent": isActive,
          "hover:bg-muted cursor-pointer": onClick && !isExpanded && !isActive,
          "hover:bg-accent cursor-pointer": onClick && (isExpanded || isActive),
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset":
            isClickable,
        },
        rowClassName,
      )}
      onClick={onClick ? () => onClick(row) : undefined}
      onMouseDown={onClick ? (e) => e.preventDefault() : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
    >
      {hasExpansion && (
        <td
          className={cn(
            "px-2 py-2 w-8",
            "first:rounded-l-lg last:rounded-r-lg",
            "align-middle text-sm leading-5 whitespace-nowrap",
          )}
        >
          {isExpandable && (
            <ChevronRight
              className={cn("h-4 w-4 text-muted-foreground transition-transform", {
                "rotate-90": isExpanded,
              })}
            />
          )}
        </td>
      )}
      {hasSelection && (
        <td
          className={cn(
            "px-4 py-2",
            "first:rounded-l-lg last:rounded-r-lg overflow-hidden",
            "align-middle text-sm leading-5 font-normal whitespace-nowrap text-ellipsis",
          )}
          onClick={(e) => {
            e.stopPropagation()
            const next = checkedState !== true
            onToggleRow?.(rowKey, next, { shiftKey: e.shiftKey })
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Checkbox checked={checkedState ?? false} className="pointer-events-none" />
        </td>
      )}
      {columns.map((col) => {
        const content = col.render(row, dataIndex)
        const useEllipsis = col.ellipsis !== false
        return (
          <td
            key={col.key}
            className={cn(
              "px-4 py-2",
              "first:rounded-l-lg last:rounded-r-lg overflow-hidden",
              "align-middle text-sm leading-5 font-normal",
              { "max-w-0 whitespace-nowrap text-ellipsis": useEllipsis },
              { "text-right": col.align === "end" },
              col.cellClassName,
            )}
          >
            {typeof content === "string" ? (
              <Text.H5 {...(useEllipsis ? { noWrap: true, ellipsis: true } : {})}>{content || "-"}</Text.H5>
            ) : (
              content
            )}
          </td>
        )
      })}
    </tr>
  )
}

export const DataRow = memo(DataRowInner) as typeof DataRowInner
