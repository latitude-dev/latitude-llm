import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { type ReactNode, useLayoutEffect, useRef } from "react"
import { cn } from "../../../utils/cn.ts"
import type { SortDirection } from "../../../utils/filtersHelpers.ts"
import { Text } from "../../text/text.tsx"
import { ResizableHandle } from "./resizable-handle.tsx"

const TH_HORIZONTAL_PADDING = 32

function SortIcon({ direction }: { direction: SortDirection | null }) {
  const cls = "h-3.5 w-3.5 shrink-0"
  if (direction === "asc") return <ArrowUp className={cls} />
  if (direction === "desc") return <ArrowDown className={cls} />
  return <ArrowUpDown className={cn(cls, "opacity-40")} />
}

function ariaSort(direction: SortDirection | null | undefined): "ascending" | "descending" | "none" {
  if (direction === "asc") return "ascending"
  if (direction === "desc") return "descending"
  return "none"
}

export function HeaderCell({
  children,
  align = "start",
  resizable = true,
  minWidth = 60,
  className,
  sortable,
  sortDirection,
  onSortClick,
  subheader,
  showSubheaderSlot = false,
}: {
  children?: ReactNode
  align?: "start" | "end"
  resizable?: boolean
  minWidth?: number
  className?: string
  sortable?: boolean
  sortDirection?: SortDirection | null
  onSortClick?: () => void
  /** Second line inside the same `<th>` (e.g. column metrics). */
  subheader?: ReactNode
  /** When true, reserve a bottom row so all header cells align when only some have `subheader`. */
  showSubheaderSlot?: boolean
}) {
  const TextComp = sortable ? "button" : "div"
  const textProps = sortable ? { type: "button" as const, onClick: onSortClick } : {}
  const thRef = useRef<HTMLTableCellElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const headerMinWidth = useRef(minWidth)

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    headerMinWidth.current = Math.max(minWidth, el.offsetWidth + TH_HORIZONTAL_PADDING)
  }, [minWidth, children, subheader, showSubheaderSlot])

  const headerLabel =
    typeof children === "string" ? (
      <Text.H6 weight="medium" color="foregroundMuted">
        {children}
      </Text.H6>
    ) : (
      children
    )

  return (
    <th
      ref={thRef}
      className={cn(
        "relative overflow-hidden px-4", // matches TH_HORIZONTAL_PADDING
        showSubheaderSlot ? "py-1.5 align-top" : "h-12 align-middle",
        className,
      )}
      aria-sort={sortable ? ariaSort(sortDirection) : undefined}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-col gap-0">
        <div
          className={cn(
            "flex min-w-0 items-center",
            showSubheaderSlot ? "shrink-0" : "h-full",
            align === "end" && "justify-end",
          )}
        >
          <TextComp
            {...textProps}
            className={cn("flex min-w-0 items-center truncate", {
              "w-full justify-end": align === "end",
              "bg-transparent border-none rounded-sm p-0 cursor-pointer select-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring":
                sortable,
            })}
          >
            <span ref={measureRef} className="inline-flex w-fit min-w-0 items-center gap-1">
              {sortable && <SortIcon direction={sortDirection ?? null} />}
              {headerLabel}
            </span>
          </TextComp>
        </div>
        {showSubheaderSlot && (
          <div className={cn("flex w-full min-w-0 shrink-0 items-center", align === "end" && "justify-end")}>
            {subheader ?? <span className="block w-full shrink-0" aria-hidden />}
          </div>
        )}
      </div>
      <ResizableHandle minWidth={headerMinWidth} thRef={thRef} disabled={!resizable} />
    </th>
  )
}
