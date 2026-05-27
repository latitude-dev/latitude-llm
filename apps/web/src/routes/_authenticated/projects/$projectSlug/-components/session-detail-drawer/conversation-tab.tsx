import { Text } from "@repo/ui"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { useConversationAnnotationFocus } from "../annotations/hooks/use-conversation-annotation-focus.ts"
import { ConversationTab as TraceConversationTab } from "../trace-detail-drawer/tabs/conversation-tab.tsx"

/**
 * The session Conversation tab renders the latest ingested trace's
 * conversation (with that trace's inline annotations) by mounting the existing
 * trace ConversationTab against `latestTraceId`. Reusing the full trace keeps
 * inline annotation anchoring (`messageIndex`) exact. When the Annotations tab
 * focuses an annotation on the latest trace (which writes the `annotationId`
 * param and switches here) the conversation scrolls to + opens that annotation.
 */
export function ConversationTab({
  projectId,
  latestTraceId,
  isActive,
  searchQuery,
}: {
  readonly projectId: string
  readonly latestTraceId: string
  readonly isActive: boolean
  readonly searchQuery?: string
}) {
  const [focusAnnotationId, setFocusAnnotationId] = useParamState("annotationId", "")
  const { scrollContainerRef, textSelectionPopoverControlsRef, traceDetail, isDetailLoading } =
    useConversationAnnotationFocus({
      projectId,
      traceId: latestTraceId,
      focusAnnotationId,
      isConversationActive: isActive,
      onFocusConsumed: () => setFocusAnnotationId(""),
    })

  if (!latestTraceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <Text.H5 color="foregroundMuted">No conversation in this session.</Text.H5>
      </div>
    )
  }

  return (
    <TraceConversationTab
      traceDetail={traceDetail}
      isDetailLoading={isDetailLoading}
      projectId={projectId}
      isActive={isActive}
      scrollContainerRef={scrollContainerRef}
      textSelectionPopoverControlsRef={textSelectionPopoverControlsRef}
      {...(searchQuery ? { searchQuery } : {})}
    />
  )
}
