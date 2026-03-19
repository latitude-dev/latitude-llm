import { Conversation, Skeleton, Text } from "@repo/ui"
import type { TraceDetailRecord } from "../../../../../../../domains/traces/traces.functions.ts"

export function ConversationTab({
  traceDetail,
  isDetailLoading,
}: {
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isDetailLoading: boolean
}) {
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
    <div className="flex flex-col py-8 px-4 overflow-y-auto flex-1">
      <Conversation systemInstructions={traceDetail.systemInstructions} messages={traceDetail.allMessages} />
    </div>
  )
}
