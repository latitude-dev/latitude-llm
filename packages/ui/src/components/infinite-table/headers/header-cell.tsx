import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { type ReactNode, useLayoutEffect, useRef } from "react"
import { cn } from "../../../utils/cn.ts"
import type { SortDirection } from "../../../utils/filtersHelpers.ts"
import { Text } from "../../text/text.tsx"
import { ResizableHandle } from "./resizable-handle.tsx"

/** Horizontal inset for label + resize affordance (must match Tailwind padding sum). */
const TH_HORIZONTAL_PADDING = 32
/** Resizable `<th>`: same total width as `px-4`, shifted toward `pr` so the grab strip does not crowd the label. */
const RESIZABLE_HEADER_PADDING = "pl-3 pr-5" as const

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
  width: preferredWidth,
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
  /** Preferred starting width (px); the first layout lock keeps at least this width. */
  width?: number
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
  const subheaderMeasureRef = useRef<HTMLDivElement>(null)
  const headerMinWidth = useRef(minWidth)

  useLayoutEffect(() => {
    const titleW = measureRef.current?.offsetWidth ?? 0
    const subW =
      showSubheaderSlot && subheader != null && subheaderMeasureRef.current
        ? subheaderMeasureRef.current.offsetWidth
        : 0
    const contentW = Math.max(titleW, subW)
    headerMinWidth.current = Math.max(minWidth, contentW + TH_HORIZONTAL_PADDING)
  }, [minWidth, children, subheader, showSubheaderSlot, align])

  const headerLabel =
    typeof children === "string" ? (
      <Text.H6 weight="medium" color="foregroundMuted" noWrap>
        {children}
      </Text.H6>
    ) : (
      children
    )

  const thStyle =
    preferredWidth !== undefined
      ? ({
          width: preferredWidth,
          ...(minWidth > 60 ? { minWidth } : {}),
        } as const)
      : minWidth > 60
        ? ({ minWidth } as const)
        : undefined

  const headerBody = (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-0">
      <div
        className={cn(
          "flex min-w-min items-center",
          showSubheaderSlot ? "shrink-0" : sortable ? "h-full" : "",
          align === "end" && "justify-end",
          align === "end" && sortable && "w-full",
          align === "end" && !sortable && "self-end",
          align === "start" && !sortable && "self-start",
        )}
      >
        <TextComp
          {...textProps}
          className={cn("flex items-center whitespace-nowrap", {
            "w-max max-w-full": !sortable,
            "w-full min-w-0 justify-end": align === "end" && sortable,
            "bg-transparent border-none rounded-sm p-0 cursor-pointer select-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring":
              sortable,
          })}
        >
          <span ref={measureRef} className="inline-flex w-max shrink-0 items-center gap-1 whitespace-nowrap">
            {sortable && <SortIcon direction={sortDirection ?? null} />}
            {headerLabel}
          </span>
        </TextComp>
      </div>
      {showSubheaderSlot && (
        <div className={cn("flex w-full min-w-0 shrink-0 items-center", align === "end" && "justify-end")}>
          {subheader != null ? (
            <div
              ref={subheaderMeasureRef}
              className={cn("max-w-full shrink-0", align === "end" ? "ml-auto w-max" : "w-max")}
            >
              {subheader}
            </div>
          ) : (
            <span className="block w-full shrink-0" aria-hidden />
          )}
        </div>
      )}
    </div>
  )

  return (
    <th
      ref={thRef}
      className={cn(
        "relative overflow-hidden",
        resizable ? RESIZABLE_HEADER_PADDING : "px-4",
        showSubheaderSlot ? "py-1.5 align-top" : "h-12 align-middle",
        className,
      )}
      style={thStyle}
      aria-sort={sortable ? ariaSort(sortDirection) : undefined}
    >
      {headerBody}
      {resizable ? <ResizableHandle minWidth={headerMinWidth} thRef={thRef} disabled={false} /> : null}
    </th>
  )
}
