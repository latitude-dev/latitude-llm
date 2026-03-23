import { Skeleton, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import { useSpanDetail } from "../../../../../../../../../domains/spans/spans.collection.ts"
import { SpanDetailContent } from "./span-detail-content.tsx"

export function SpanDetail({
  traceId,
  spanId,
  onClose,
}: {
  readonly traceId: string
  readonly spanId: string
  readonly onClose: () => void
}) {
  const { data: span, isLoading } = useSpanDetail({ traceId, spanId })

  return (
    <div className="flex flex-col flex-1 overflow-hidden border-t border-border">
      <div className="flex flex-row items-center justify-between shrink-0 px-4 py-2 border-b border-border">
        {isLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <Text.H5 noWrap ellipsis>
            {span?.name ?? "Span Detail"}
          </Text.H5>
        )}
        <button
          type="button"
          className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
          onClick={onClose}
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-20" />
            <div className="flex flex-row flex-wrap gap-4">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : span ? (
          <SpanDetailContent span={span} />
        ) : (
          <Text.H6 color="foregroundMuted">Span not found</Text.H6>
        )}
      </div>
    </div>
  )
}
