import { type KeyboardEvent, memo, useCallback } from "react"
import { cn } from "../../utils/cn.ts"
import { Checkbox, type CheckedState } from "../checkbox/checkbox.tsx"
import { Text } from "../text/text.tsx"
import type { InfiniteTableColumn } from "./types.ts"

interface DataRowProps<T> {
  row: T
  rowKey: string
  columns: InfiniteTableColumn<T>[]
  isSelected?: boolean
  isActive?: boolean
  onToggleRow?: (key: string, checked: CheckedState) => void
  hasSelection: boolean
  onClick?: (row: T) => void
  dataIndex: number
  measureRef: (node: Element | null) => void
}

function DataRowInner<T>({
  row,
  rowKey,
  columns,
  isSelected,
  isActive,
  onToggleRow,
  hasSelection,
  onClick,
  dataIndex,
  measureRef,
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

  return (
    <tr
      ref={measureRef}
      data-index={dataIndex}
      className={cn("bg-secondary transition-colors", {
        "bg-accent": isActive,
        "hover:bg-muted cursor-pointer": onClick,
        "hover:bg-accent": onClick && isActive,
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring": onClick,
      })}
      onClick={onClick ? () => onClick(row) : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
    >
      {hasSelection && (
        <td
          className="px-4 py-2 align-middle text-sm leading-5 font-normal whitespace-nowrap overflow-hidden text-ellipsis"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Checkbox checked={isSelected ?? false} onCheckedChange={(checked) => onToggleRow?.(rowKey, checked)} />
        </td>
      )}
      {columns.map((col) => {
        const content = col.render(row)
        return (
          <td
            key={col.key}
            className="px-4 py-2 align-middle text-sm leading-5 font-normal whitespace-nowrap overflow-hidden text-ellipsis"
          >
            {typeof content === "string" ? (
              <Text.H5 noWrap ellipsis>
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
