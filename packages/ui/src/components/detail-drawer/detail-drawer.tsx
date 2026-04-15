import { PanelRightCloseIcon } from "lucide-react"
import { type KeyboardEvent, type ReactNode, useCallback, useRef, useState, useSyncExternalStore } from "react"
import { useLocalStorage } from "../../hooks/use-local-storage.ts"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { Button } from "../button/button.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"

const DEFAULT_MIN_WIDTH = 360
const DEFAULT_DEFAULT_WIDTH = 520
const KEYBOARD_STEP = 20

function subscribeToResize(cb: () => void) {
  window.addEventListener("resize", cb)
  return () => window.removeEventListener("resize", cb)
}

function getMaxWidth() {
  return Math.floor(window.innerWidth / 2)
}

function useMaxWidth() {
  return useSyncExternalStore(subscribeToResize, getMaxWidth, () => DEFAULT_DEFAULT_WIDTH)
}

function clampWidth(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function useDrawerWidth({
  storeKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: {
  storeKey: string | undefined
  defaultWidth: number
  minWidth: number
  maxWidth: number
}) {
  const stored = useLocalStorage<number | null>({
    key: storeKey,
    defaultValue: null,
  })
  const hasStore = storeKey !== undefined
  const hasStoredValue = hasStore && stored.value !== null

  const [rawWidth, setRawWidth] = useState(() => (hasStoredValue ? stored.value : defaultWidth))
  const userHasResized = useRef(hasStoredValue)

  useMountEffect(() => {
    if (!userHasResized.current) {
      setRawWidth(defaultWidth)
    }
  })

  const width = clampWidth(rawWidth, minWidth, maxWidth)

  const setWidth = useCallback(
    (next: number) => {
      userHasResized.current = true
      setRawWidth(next)
      if (hasStore) stored.setValue(next)
    },
    [hasStore, stored.setValue],
  )

  return { width, setWidth }
}

export function DetailDrawer({
  onClose,
  closeLabel,
  header,
  actions,
  rightActions,
  children,
  storeKey,
  minWidth = DEFAULT_MIN_WIDTH,
  defaultWidth = DEFAULT_DEFAULT_WIDTH,
  maxWidth: maxWidthProp,
  resizeFrom = "left",
}: {
  /** Called when close button is clicked. If omitted, the header bar with close button is not rendered. */
  onClose?: () => void
  /** Tooltip content for the close button (e.g. "Close" + HotkeyBadge). Defaults to "Close". */
  closeLabel?: ReactNode
  header?: ReactNode
  actions?: ReactNode
  rightActions?: ReactNode
  children: ReactNode
  storeKey?: string
  minWidth?: number
  defaultWidth?: number
  /** Override the default max width (which is 50% of window width). */
  maxWidth?: number
  /** Which side the resize handle appears on. "left" for right-side panels, "right" for left-side panels. Defaults to "left". */
  resizeFrom?: "left" | "right"
}) {
  const dynamicMaxWidth = useMaxWidth()
  const maxWidth = maxWidthProp ?? dynamicMaxWidth
  const { width, setWidth } = useDrawerWidth({
    storeKey,
    defaultWidth,
    minWidth,
    maxWidth,
  })
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const moveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const upHandlerRef = useRef<(() => void) | null>(null)

  const cleanupDrag = useCallback(() => {
    if (moveHandlerRef.current) {
      document.removeEventListener("mousemove", moveHandlerRef.current)
      moveHandlerRef.current = null
    }
    if (upHandlerRef.current) {
      document.removeEventListener("mouseup", upHandlerRef.current)
      upHandlerRef.current = null
    }
  }, [])

  useMountEffect(() => cleanupDrag)

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      startX.current = e.clientX
      startWidth.current = width

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = resizeFrom === "left" ? startX.current - moveEvent.clientX : moveEvent.clientX - startX.current
        setWidth(Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta)))
      }

      const onMouseUp = () => {
        setIsDragging(false)
        cleanupDrag()
      }

      moveHandlerRef.current = onMouseMove
      upHandlerRef.current = onMouseUp
      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [width, minWidth, maxWidth, setWidth, cleanupDrag, resizeFrom],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      let next: number | undefined
      const expandKey = resizeFrom === "left" ? "ArrowLeft" : "ArrowRight"
      const shrinkKey = resizeFrom === "left" ? "ArrowRight" : "ArrowLeft"
      switch (e.key) {
        case expandKey:
          next = width + KEYBOARD_STEP
          break
        case shrinkKey:
          next = width - KEYBOARD_STEP
          break
        case "Home":
          next = maxWidth
          break
        case "End":
          next = minWidth
          break
        default:
          return
      }
      e.preventDefault()
      setWidth(next)
    },
    [width, minWidth, maxWidth, setWidth, resizeFrom],
  )

  const resizeHandle = (
    // biome-ignore lint/a11y/useSemanticElements: resize handle requires div for drag events
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuetext={`Panel width: ${width} pixels`}
      tabIndex={0}
      className={cn(
        "relative cursor-col-resize shrink-0 transition-colors",
        "before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-['']",
        resizeFrom === "left" ? "border-l" : "border-r",
        isDragging ? "border-primary" : "hover:border-primary",
      )}
      onMouseDown={onDragStart}
      onKeyDown={onKeyDown}
    />
  )

  return (
    <div className="flex flex-row h-full shrink-0" style={{ width }}>
      {resizeFrom === "left" && resizeHandle}

      <div className="flex flex-col flex-1 min-w-0 h-full bg-background">
        {onClose && (
          <div className="flex flex-row items-center justify-between px-6 py-4 border-b shrink-0">
            <div className="w-full flex flex-row items-center justify-between gap-1">
              <div className="flex flex-row items-center gap-x-1">
                <Tooltip
                  side="bottom"
                  asChild
                  trigger={
                    <Button variant="outline" className="w-8 h-8 p-0" onClick={onClose}>
                      <PanelRightCloseIcon className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  }
                >
                  {closeLabel ?? "Close"}
                </Tooltip>
                {actions}
              </div>
              {rightActions ? <div className="flex flex-row items-center gap-x-1">{rightActions}</div> : null}
            </div>
          </div>
        )}

        {header && <div className="flex flex-col px-6 py-4 gap-5 border-b shrink-0">{header}</div>}

        {children}
      </div>

      {resizeFrom === "right" && resizeHandle}
    </div>
  )
}
