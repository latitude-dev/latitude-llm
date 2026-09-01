import { useMountEffect } from "@repo/ui"
import { useBlocker } from "@tanstack/react-router"
import { useRef } from "react"

interface UseDirtyGuardInput {
  readonly hasDirty: boolean
  readonly isApplying: boolean
  /** Blocks cmd-S when validation fails. Defaults to `hasDirty`. */
  readonly canApply?: boolean
  readonly confirmMessage: string
  readonly onApply: () => void | Promise<void>
  readonly onDiscard: () => void
}

/** Takes the dirty state rather than owning it: the pages that need this disagree on its shape. */
export function useDirtyGuard(input: UseDirtyGuardInput): void {
  // Latest-value refs so the mount-only keydown listener never re-subscribes.
  const latest = useRef(input)
  latest.current = input

  useMountEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const { hasDirty, isApplying, canApply, onApply, onDiscard } = latest.current
      if (!hasDirty) return
      const target = event.target as HTMLElement | null
      const inField =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable === true)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (canApply ?? true) void onApply()
      } else if (event.key === "Escape" && !inField && !isApplying) {
        // A dropdown or modal owns Escape while it is open, and this listener is on `window`,
        // so discarding here would swallow the key the overlay needs to close itself.
        if (document.querySelector("[data-radix-popper-content-wrapper], [role='dialog'][data-state='open']")) return
        event.preventDefault()
        onDiscard()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  })

  useBlocker({
    shouldBlockFn: () => {
      if (!latest.current.hasDirty) return false
      return !window.confirm(latest.current.confirmMessage)
    },
    enableBeforeUnload: () => latest.current.hasDirty,
    disabled: !input.hasDirty,
  })
}
