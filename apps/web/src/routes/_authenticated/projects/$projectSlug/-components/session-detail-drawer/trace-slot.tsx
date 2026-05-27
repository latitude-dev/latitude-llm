import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { TraceDetailBody } from "../trace-detail-drawer.tsx"

export type TraceDetailTabId = "trace" | "conversation" | "spans" | "annotations"

export function isTraceDetailTab(value: string): value is TraceDetailTabId {
  return value === "trace" || value === "conversation" || value === "spans" || value === "annotations"
}

/**
 * The trace slot reuses the standalone trace drawer's body (`TraceDetailBody`)
 * — same tabs, conversation, span tree, annotations — minus the `DetailDrawer`
 * chrome and next/prev nav. The outer session drawer supplies the chrome and a
 * "← View session" back control. The slot owns its own `traceTab` URL param,
 * distinct from the session slot's `sessionTab`, so the two never collide.
 */
export function TraceSlot({
  projectId,
  traceId,
  searchQuery,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly searchQuery?: string
}) {
  const [activeTab, setActiveTab] = useParamState("traceTab", "trace", { validate: isTraceDetailTab })
  const [selectedSpanId, setSelectedSpanId] = useParamState("spanId", "")
  const [focusAnnotationId] = useParamState("annotationId", "")

  return (
    <TraceDetailBody
      traceId={traceId}
      projectId={projectId}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      selectedSpanId={selectedSpanId}
      onSelectedSpanIdChange={setSelectedSpanId}
      {...(focusAnnotationId ? { focusAnnotationId } : {})}
      {...(searchQuery ? { searchQuery } : {})}
    />
  )
}
