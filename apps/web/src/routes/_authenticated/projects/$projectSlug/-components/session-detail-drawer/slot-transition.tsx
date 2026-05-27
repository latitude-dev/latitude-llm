import type { ReactNode } from "react"

/**
 * Horizontal slide between the session slot and the trace slot, driven purely
 * by CSS transforms (no animation library). Each pane is absolutely positioned
 * at `inset-0` (always full drawer width/height) and translated independently:
 * the session slot sits at 0 and slides off to the left (`-100%`) while the
 * trace slot comes in from the right (`+100%` → `0`). Only one pane is on
 * screen at a time; the other is translated fully off-screen, `aria-hidden`,
 * and `inert` so Tab/Enter can't reach controls the user can't see.
 */
export function SlotTransition({
  showTrace,
  sessionSlot,
  traceSlot,
}: {
  readonly showTrace: boolean
  readonly sessionSlot: ReactNode
  readonly traceSlot: ReactNode
}) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="absolute inset-0 flex flex-col transition-transform duration-200 ease-out"
        style={{ transform: showTrace ? "translateX(-100%)" : "translateX(0)" }}
        aria-hidden={showTrace}
        inert={showTrace}
      >
        {sessionSlot}
      </div>
      <div
        className="absolute inset-0 flex flex-col transition-transform duration-200 ease-out"
        style={{ transform: showTrace ? "translateX(0)" : "translateX(100%)" }}
        aria-hidden={!showTrace}
        inert={!showTrace}
      >
        {traceSlot}
      </div>
    </div>
  )
}
