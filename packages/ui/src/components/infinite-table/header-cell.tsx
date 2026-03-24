import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import type { SortDirection } from "../../utils/filtersHelpers.ts"
import { Text } from "../text/text.tsx"

const TH_HORIZONTAL_PADDING = 32

function ResizableHandle({
  minWidth,
  thRef,
  disabled = false,
}: {
  minWidth: React.RefObject<number>
  thRef: React.RefObject<HTMLTableCellElement | null>
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const rafRef = useRef(0)

  useMountEffect(() => {
    return () => {
      abortRef.current?.abort()
      cancelAnimationFrame(rafRef.current)
    }
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const th = thRef.current
      if (!th) return
      const table = th.closest("table")
      if (!table) return

      const headerRow = th.parentElement
      if (headerRow) {
        for (const sibling of Array.from(headerRow.children) as HTMLTableCellElement[]) {
          if (!sibling.style.width) {
            sibling.style.width = `${sibling.offsetWidth}px`
          }
        }
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const startX = e.clientX
      const startColWidth = th.offsetWidth
      const startTableWidth = table.offsetWidth
      setDragging(true)

      const onPointerMove = (ev: PointerEvent) => {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          const newColWidth = Math.max(minWidth.current, startColWidth + (ev.clientX - startX))
          const tableDelta = newColWidth - startColWidth
          th.style.width = `${newColWidth}px`
          table.style.width = `${startTableWidth + tableDelta}px`
        })
      }

      const onPointerUp = () => {
        cancelAnimationFrame(rafRef.current)
        setDragging(false)
        controller.abort()
        abortRef.current = null
      }

      document.addEventListener("pointermove", onPointerMove, {
        signal: controller.signal,
      })
      document.addEventListener("pointerup", onPointerUp, {
        signal: controller.signal,
      })
    },
    [thRef],
  )

  return (
    <div
      role="none"
      onPointerDown={disabled ? undefined : onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "group/resize absolute right-0 top-0 h-full w-4 translate-x-1/2 z-10 select-none flex items-center justify-center",
        {
          "cursor-col-resize": !disabled,
        },
      )}
    >
      <div
        className={cn("w-px h-7 bg-border transition-all pointer-events-none", {
          "group-hover/resize:w-0.5 group-hover/resize:bg-accent-foreground/40": !disabled,
          "w-0.5 bg-accent-foreground/40": dragging,
        })}
      />
    </div>
  )
}

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
}: {
  children: ReactNode
  align?: "start" | "end"
  resizable?: boolean
  minWidth?: number
  className?: string
  sortable?: boolean
  sortDirection?: SortDirection | null
  onSortClick?: () => void
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
  }, [minWidth, children])

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
        "relative h-12 align-middle overflow-hidden",
        "px-4", // matches TH_HORIZONTAL_PADDING
        className,
      )}
      aria-sort={sortable ? ariaSort(sortDirection) : undefined}
    >
      {" "}
      <TextComp
        {...textProps}
        className={cn("flex w-full h-full items-center truncate", {
          "justify-end": align === "end",
          "bg-transparent border-none rounded-sm p-0 cursor-pointer select-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring":
            sortable,
        })}
      >
        <span ref={measureRef} className="inline-flex items-center gap-1 w-fit">
          {sortable && <SortIcon direction={sortDirection ?? null} />}
          {headerLabel}
        </span>
      </TextComp>
      <ResizableHandle minWidth={headerMinWidth} thRef={thRef} disabled={!resizable} />
    </th>
  )
}
