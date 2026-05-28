import type { ReactNode } from "react"

export type DetailSlotKind = "trace" | "issue"

/**
 * Horizontal slide between the session slot and a detail slot (trace or
 * issue), driven purely by CSS transforms (no animation library). Each pane is
 * absolutely positioned at `inset-0` (always full drawer width/height) and
 * translated independently: the session slot sits at 0 and slides off to the
 * left (`-100%`) while the detail slot comes in from the right (`+100%` → `0`).
 *
 * `trace` and `issue` panes share the +100% offset because they are mutually
 * exclusive — only one detail kind can be open at a time. Switching between
 * them swaps the rendered pane in place (no slide); the slide animation only
 * fires when entering or leaving the session view.
 *
 * Only one pane is on screen at a time; the others are translated fully
 * off-screen, `aria-hidden`, and `inert` so Tab/Enter can't reach controls the
 * user can't see.
 */
export function SlotTransition({
  detailKind,
  sessionSlot,
  traceSlot,
  issueSlot,
}: {
  /** `null` means the session pane is visible. */
  readonly detailKind: DetailSlotKind | null
  readonly sessionSlot: ReactNode
  readonly traceSlot: ReactNode
  readonly issueSlot: ReactNode
}) {
  const showDetail = detailKind !== null
  const showTrace = detailKind === "trace"
  const showIssue = detailKind === "issue"
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="absolute inset-0 flex flex-col transition-transform duration-200 ease-out"
        style={{ transform: showDetail ? "translateX(-100%)" : "translateX(0)" }}
        aria-hidden={showDetail}
        inert={showDetail}
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
      <div
        className="absolute inset-0 flex flex-col transition-transform duration-200 ease-out"
        style={{ transform: showIssue ? "translateX(0)" : "translateX(100%)" }}
        aria-hidden={!showIssue}
        inert={!showIssue}
      >
        {issueSlot}
      </div>
    </div>
  )
}
