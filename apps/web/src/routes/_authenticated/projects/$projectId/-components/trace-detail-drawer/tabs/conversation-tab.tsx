import { Conversation, Skeleton, Text } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { useRef } from "react"
import { mapConversationToSpans } from "../../../../../../../domains/spans/spans.functions.ts"
import type { TraceDetailRecord } from "../../../../../../../domains/traces/traces.functions.ts"

export function ConversationTab({
  traceDetail,
  isDetailLoading,
  navigateToSpan,
  projectId,
}: {
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isDetailLoading: boolean
  readonly navigateToSpan: (spanId: string) => void
  readonly projectId: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const traceId = traceDetail?.traceId
  const { data: spanMaps } = useQuery({
    queryKey: ["conversationSpanMaps", traceId],
    queryFn: () => mapConversationToSpans({ data: { projectId, traceId: traceId ?? "" } }),
    enabled: !!traceId,
  })

  const messageActions =
    spanMaps && Object.keys(spanMaps.messageSpanMap).length > 0
      ? new Map(
          Object.entries(spanMaps.messageSpanMap).map(([idx, spanId]) => [Number(idx), () => navigateToSpan(spanId)]),
        )
      : undefined

  const toolCallActions =
    spanMaps && Object.keys(spanMaps.toolCallSpanMap).length > 0
      ? new Map(
          Object.entries(spanMaps.toolCallSpanMap).map(([toolCallId, spanId]) => [
            toolCallId,
            () => navigateToSpan(spanId),
          ]),
        )
      : undefined

  if (isDetailLoading) {
    return (
      <div className="flex flex-col gap-4 py-8 px-4 flex-1">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (!traceDetail) {
    return (
      <div className="flex items-center justify-center py-6 flex-1">
        <Text.H5 color="foregroundMuted">No conversation data</Text.H5>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex flex-col py-8 pr-4 overflow-y-auto flex-1">
      <Conversation
        systemInstructions={traceDetail.systemInstructions}
        messages={traceDetail.allMessages}
        enableNavigator
        scrollContainerRef={scrollRef}
        {...(messageActions ? { messageActions } : {})}
        {...(toolCallActions ? { toolCallActions } : {})}
      />
    </div>
  )
}
