import { type ReactNode, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "../../utils/cn.ts"

const ENTER_TRANSITION_MS = 300

/**
 * Side-anchored panel that overlays the page with a dimming backdrop —
 * what other libraries call a Sheet (shadcn/ui, Radix) or Slide-over
 * (Tailwind UI / Headless UI). Distinct from `DetailDrawer`, which is the
 * docked, resizable, persistent right panel.
 *
 * `open` drives the animation: flip it to `true` and the panel mounts +
 * slides in from the right; flip back to `false` and it slides out and
 * unmounts after the exit animation finishes. Children are snapshotted at
 * each render where `open` is true, so consumers can clear their bound
 * state in `onClose` and the panel will still animate out with the right
 * content. Use `onClosed` if you need a precise post-animation hook.
 *
 * Escape is captured at the document level with `stopImmediatePropagation`,
 * so this sheet's close pre-empts any parent hotkey handler (e.g. an outer
 * "back to previous view") without the parent needing to know about it.
 */
export function Sheet({
  open,
  onClose,
  onClosed,
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  closeAriaLabel = "Close panel",
}: {
  readonly open: boolean
  readonly onClose: () => void
  /** Fired after the exit animation finishes — use to clear bound state. */
  readonly onClosed?: () => void
  readonly children: ReactNode
  readonly closeOnBackdrop?: boolean
  readonly closeOnEscape?: boolean
  readonly closeAriaLabel?: string
}) {
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  // Tracks whether this Sheet has ever been opened. Without it, the first
  // render with `open === false` would schedule the exit timer and fire
  // `onClosed` 300ms later — even though no open/close cycle happened.
  const hasOpenedRef = useRef(open)
  const onClosedRef = useRef(onClosed)
  onClosedRef.current = onClosed

  // Snapshot children whenever the sheet is open, so the exit animation
  // can keep rendering the last-known content even if the consumer clears
  // its backing state when it calls `onClose`.
  const childrenRef = useRef(children)
  if (open) {
    childrenRef.current = children
  }

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true
      setMounted(true)
      // Double rAF: mount first paint at `translate-x-full`, then flip on
      // the next frame so the browser actually animates the transform.
      // `transitionend` is unreliable when motion is reduced or interrupted,
      // so we drive both phases off plain timers.
      let cancelled = false
      const enterId = requestAnimationFrame(() => {
        if (cancelled) return
        requestAnimationFrame(() => {
          if (!cancelled) setEntered(true)
        })
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(enterId)
      }
    }
    if (!hasOpenedRef.current) return
    setEntered(false)
    const exitId = setTimeout(() => {
      setMounted(false)
      onClosedRef.current?.()
    }, ENTER_TRANSITION_MS)
    return () => clearTimeout(exitId)
  }, [open])

  useEffect(() => {
    if (!open || !closeOnEscape) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false)
      if (isEditable) return
      event.stopImmediatePropagation()
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", handler, { capture: true })
    return () => document.removeEventListener("keydown", handler, { capture: true })
  }, [open, closeOnEscape, onClose])

  if (!mounted || typeof document === "undefined") return null

  return createPortal(
    <>
      <button
        type="button"
        aria-label={closeAriaLabel}
        className={cn(
          "fixed inset-0 z-[45] bg-foreground/10 transition-opacity duration-200",
          entered ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={closeAriaLabel}
        className={cn(
          "fixed inset-y-0 right-0 z-[50] flex max-h-dvh shadow-2xl will-change-transform transition-transform duration-300 ease-out",
          entered ? "translate-x-0" : "translate-x-full",
        )}
      >
        {childrenRef.current}
      </div>
    </>,
    document.body,
  )
}
