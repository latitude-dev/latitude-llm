import { type RefObject, useCallback, useRef, useState } from "react"
import { useMountEffect } from "../../../hooks/use-mount-effect.ts"
import { cn } from "../../../utils/cn.ts"

export function ResizableHandle({
  minWidth,
  thRef,
  disabled = false,
}: {
  minWidth: RefObject<number>
  thRef: RefObject<HTMLTableCellElement | null>
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
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
          // Normalize inline widths to the current rendered layout before drag starts.
          sibling.style.width = `${sibling.offsetWidth}px`
        }
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const startX = e.clientX
      const startColWidth = th.offsetWidth
      const startTableWidth = table.offsetWidth
      const effectiveMinWidth = Math.min(startColWidth, minWidth.current)
      setDragging(true)

      const onPointerMove = (ev: PointerEvent) => {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          const newColWidth = Math.max(effectiveMinWidth, startColWidth + (ev.clientX - startX))
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
    [minWidth, thRef],
  )

  const lineWide = !disabled && (hovered || dragging)

  return (
    <div
      role="none"
      onPointerDown={disabled ? undefined : onPointerDown}
      onPointerEnter={() => {
        if (!disabled) setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "absolute right-0 top-1.5 bottom-1.5 z-10 w-2 overflow-hidden select-none",
        !disabled && "cursor-col-resize",
      )}
    >
      <svg
        className={cn(
          "pointer-events-none absolute inset-0 size-full transition-colors duration-150",
          lineWide ? "text-accent-foreground/40" : "text-border",
        )}
        preserveAspectRatio="none"
        viewBox="0 0 8 100"
        aria-hidden
      >
        <title>Resize column</title>
        <line
          x1="50%"
          y1={1.5}
          x2="50%"
          y2={98.5}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={lineWide ? 3 : 1.5}
          style={{ transition: "stroke-width 150ms ease, stroke 150ms ease" }}
          vectorEffect="nonScalingStroke"
        />
      </svg>
    </div>
  )
}
