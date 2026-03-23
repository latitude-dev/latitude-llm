import { Conversation, DetailSection, DetailSummary, Skeleton, Text } from "@repo/ui"
import { formatDuration, formatPrice, relativeTime } from "@repo/utils"
import { ArrowDownRightIcon, ArrowUpRightIcon, BrainIcon, MessageSquareIcon, TextIcon } from "lucide-react"
import type { TraceDetailRecord, TraceRecord } from "../../../../../../../domains/traces/traces.functions.ts"

export function TraceTab({
  traceId,
  traceRecord,
  traceDetail,
  isRecordLoading,
  isDetailLoading,
}: {
  readonly traceId: string
  readonly traceRecord: TraceRecord | undefined
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isRecordLoading: boolean
  readonly isDetailLoading: boolean
}) {
  return (
    <div className="flex flex-col gap-8 py-8 px-4 overflow-y-auto flex-1">
      <DetailSummary
        items={[
          {
            label: "Start Time",
            value: traceRecord ? relativeTime(new Date(traceRecord.startTime)) : undefined,
            isLoading: isRecordLoading,
          },
          {
            label: "Duration",
            value: traceRecord ? formatDuration(traceRecord.durationNs) : undefined,
            isLoading: isRecordLoading,
          },
          {
            label: "Cost",
            value: traceRecord ? formatPrice(traceRecord.costTotalMicrocents / 100_000_000) : undefined,
            isLoading: isRecordLoading,
          },
          {
            label: "Trace ID",
            value: traceRecord ? traceId : undefined,
            copyable: true,
            isLoading: isRecordLoading,
          },
          {
            label: "Session ID",
            value: traceRecord ? traceRecord.sessionId : undefined,
            copyable: true,
            isLoading: isRecordLoading,
          },
          {
            label: "User ID",
            value: traceRecord ? traceRecord.userId : undefined,
            copyable: true,
            isLoading: isRecordLoading,
          },
        ]}
      />

      {traceRecord ? (
        <>
          {traceRecord.tags.length > 0 && (
            <div className="flex flex-col gap-1">
              <Text.H6 color="foregroundMuted">Tags</Text.H6>
              <div className="flex flex-row flex-wrap gap-1">
                {traceRecord.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DetailSection icon={<TextIcon className="w-4 h-4" />} label="Metadata">
            <pre className="overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(traceRecord.metadata, null, 2)}
            </pre>
          </DetailSection>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      <DetailSection icon={<BrainIcon className="w-4 h-4" />} label="System Instructions">
        {isDetailLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : traceDetail?.systemInstructions.length ? (
          <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
            <Conversation systemInstructions={traceDetail.systemInstructions} messages={[]} />
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No system instructions</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<ArrowDownRightIcon className="w-4 h-4" />} label="Input">
        {isDetailLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : traceDetail?.inputMessages.length ? (
          <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
            <Conversation messages={traceDetail.inputMessages} />
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No input messages</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<ArrowUpRightIcon className="w-4 h-4" />} label="Output">
        {isDetailLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : traceDetail?.outputMessages.length ? (
          <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
            <Conversation messages={traceDetail.outputMessages} />
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">No output messages</Text.H6>
        )}
      </DetailSection>

      <DetailSection icon={<MessageSquareIcon className="w-4 h-4" />} label="Annotations">
        <Text.H6 color="foregroundMuted">Coming soon ™</Text.H6>
      </DetailSection>
    </div>
  )
}
