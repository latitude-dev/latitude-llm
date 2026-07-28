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

/**
 * Keyboard and navigation guards for a settings page with unsaved changes:
 * cmd/ctrl-S applies, Escape discards outside a text field, and both an in-app
 * navigation and a tab close prompt for confirmation.
 *
 * Owns behaviour only — the caller owns the draft state, because the pages that
 * need this disagree on its shape (a flat field diff on one, a row-keyed overlay
 * on another).
 */
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
