import { ChevronRight } from "lucide-react"
import { type KeyboardEvent, memo, type ReactNode, useCallback } from "react"
import { cn } from "../../utils/cn.ts"
import { Checkbox, type CheckedState } from "../checkbox/checkbox.tsx"
import { Text } from "../text/text.tsx"
import type { InfiniteTableColumn } from "./types.ts"

const LINK_STRETCH_CLASS =
  "absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

const SELECTION_COLUMN_WIDTH = 48

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
  renderRowLink?: (row: T, props: { className: string }) => ReactNode
  /** When set, the chevron toggles expansion independently of the row click. */
  onToggleExpand?: (row: T) => void
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
  renderRowLink,
  onToggleExpand,
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

  const hasRowLink = Boolean(renderRowLink)
  const isClickable = Boolean(onClick) || hasRowLink
  const interactiveRole = onClick ? rowInteractionRole : undefined
  const isExpandToggleRow = Boolean(isClickable && isExpandable && !isSubRow && !onToggleExpand)
  const ariaExpanded = isExpandToggleRow ? Boolean(isExpanded) : undefined
  const ariaPressed = onClick && interactiveRole === "button" && !isExpandToggleRow ? Boolean(isActive) : undefined

  return (
    <tr
      data-index={dataIndex}
      role={interactiveRole}
      {...(onClick && rowAriaLabel ? { "aria-label": rowAriaLabel } : {})}
      {...(ariaExpanded !== undefined ? { "aria-expanded": ariaExpanded } : {})}
      {...(ariaPressed !== undefined ? { "aria-pressed": ariaPressed } : {})}
      className={cn(
        {
          "bg-secondary": !isSubRow && !isExpanded,
          "bg-muted": isExpanded && !isActive,
          "bg-accent": isActive,
          "hover:bg-muted cursor-pointer": isClickable && !isExpanded && !isActive,
          "hover:bg-accent cursor-pointer": isClickable && (isExpanded || isActive),
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset":
            Boolean(onClick),
          relative: hasRowLink,
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
            { "relative z-1": hasRowLink },
          )}
        >
          {isExpandable &&
            (onToggleExpand ? (
              <button
                type="button"
                aria-label={isExpanded ? "Collapse row" : "Expand row"}
                aria-expanded={Boolean(isExpanded)}
                className="flex items-center justify-center rounded p-0.5 hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand(row)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <ChevronRight
                  className={cn("h-4 w-4 text-muted-foreground transition-transform", {
                    "rotate-90": isExpanded,
                  })}
                />
              </button>
            ) : (
              <ChevronRight
                className={cn("h-4 w-4 text-muted-foreground transition-transform", {
                  "rotate-90": isExpanded,
                })}
              />
            ))}
        </td>
      )}
      {hasSelection && (
        <td
          style={{
            width: SELECTION_COLUMN_WIDTH,
            minWidth: SELECTION_COLUMN_WIDTH,
            maxWidth: SELECTION_COLUMN_WIDTH,
          }}
          className={cn(
            "px-4 py-2",
            "first:rounded-l-lg last:rounded-r-lg overflow-hidden",
            "align-middle text-sm leading-5 font-normal whitespace-nowrap text-ellipsis",
            { "relative z-1": hasRowLink },
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
      {columns.map((col, columnIndex) => {
        const content = col.render(row, dataIndex)
        const useEllipsis = col.ellipsis !== false
        const isFirstCol = columnIndex === 0
        return (
          <td
            key={col.key}
            {...(col.maxWidth !== undefined ? { style: { maxWidth: col.maxWidth } } : {})}
            className={cn(
              "px-4 py-2",
              "first:rounded-l-lg last:rounded-r-lg overflow-hidden",
              "align-middle text-sm leading-5 font-normal",
              { "max-w-0 whitespace-nowrap text-ellipsis": useEllipsis },
              { "text-right": col.align === "end" },
              col.cellClassName,
            )}
          >
            {isFirstCol && renderRowLink ? renderRowLink(row, { className: LINK_STRETCH_CLASS }) : null}
            {typeof content === "string" ? (
              <Text.H5
                {...(useEllipsis ? { noWrap: true, ellipsis: true } : {})}
                {...(col.align === "end" ? { align: "right" } : {})}
              >
                {content || "-"}
              </Text.H5>
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
