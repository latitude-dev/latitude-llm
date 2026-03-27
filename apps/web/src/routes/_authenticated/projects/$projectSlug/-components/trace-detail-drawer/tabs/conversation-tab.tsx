import { Conversation, ScrollNavigator, type ScrollNavigatorHandle, Skeleton, Text } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useQuery } from "@tanstack/react-query"
import { useRef } from "react"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import { mapConversationToSpans } from "../../../../../../../domains/spans/spans.functions.ts"
import type { TraceDetailRecord } from "../../../../../../../domains/traces/traces.functions.ts"

export function ConversationTab({
  traceDetail,
  isDetailLoading,
  navigateToSpan,
  projectId,
  isActive,
}: {
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isDetailLoading: boolean
  readonly navigateToSpan: (spanId: string) => void
  readonly projectId: string
  readonly isActive: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigatorRef = useRef<ScrollNavigatorHandle>(null)
  const navItemRefs = useRef<(HTMLDivElement | null)[]>([])

  const traceId = traceDetail?.traceId
  const { data: spanMaps } = useQuery({
    queryKey: ["conversationSpanMaps", projectId, traceId],
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

  useHotkeys([
    { hotkey: "N", callback: () => navigatorRef.current?.navigate("down"), options: { enabled: isActive } },
    { hotkey: "P", callback: () => navigatorRef.current?.navigate("up"), options: { enabled: isActive } },
  ])

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
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex flex-col py-8 pr-4 overflow-y-auto flex-1">
        <Conversation
          systemInstructions={traceDetail.systemInstructions}
          messages={traceDetail.allMessages}
          navItemRefsRef={navItemRefs}
          {...(messageActions ? { messageActions } : {})}
          {...(toolCallActions ? { toolCallActions } : {})}
        />
      </div>
      <div className="absolute top-4 right-4 z-10">
        <ScrollNavigator
          ref={navigatorRef}
          scrollContainerRef={scrollRef}
          itemRefs={navItemRefs}
          prevLabel={
            <>
              Previous <HotkeyBadge hotkey="P" />
            </>
          }
          nextLabel={
            <>
              Next <HotkeyBadge hotkey="N" />
            </>
          }
        />
      </div>
    </div>
  )
}
