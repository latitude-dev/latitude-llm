import { cn, Skeleton, Text } from "@repo/ui"
import { XIcon } from "lucide-react"
import { useSpanDetail } from "../../../../../../../../../domains/spans/spans.collection.ts"
import { useResizablePanelHeight } from "../../../../../../../../../lib/hooks/useResizablePanelHeight.ts"
import { SpanDetailContent } from "./span-detail-content.tsx"

const MIN_PANEL_HEIGHT = 140
const MIN_CONTENT_ABOVE = 160
const CLOSE_DRAG_THRESHOLD = 96

export function SpanDetail({
  projectId,
  traceId,
  spanId,
  startTimeFrom,
  startTimeTo,
  onClose,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly spanId: string
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
  readonly onClose: () => void
}) {
  const { data: span, isLoading } = useSpanDetail({ projectId, traceId, spanId, startTimeFrom, startTimeTo })
  const { panelRef, height, isDragging, onPointerDown, onKeyDown } = useResizablePanelHeight({
    minHeight: MIN_PANEL_HEIGHT,
    minContentAbove: MIN_CONTENT_ABOVE,
    closeThreshold: CLOSE_DRAG_THRESHOLD,
    defaultHeight: "half",
    onClose,
  })
  const maxHeight = panelRef.current?.parentElement
    ? Math.max(MIN_PANEL_HEIGHT, panelRef.current.parentElement.offsetHeight - MIN_CONTENT_ABOVE)
    : height

  return (
    <div
      ref={panelRef}
      className="relative flex shrink-0 flex-col overflow-hidden border-t border-border"
      style={{ height }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: resize handle requires div for drag events */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize span detail"
        aria-valuenow={height}
        aria-valuemin={MIN_PANEL_HEIGHT}
        aria-valuemax={maxHeight}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="group absolute inset-x-0 -top-1 z-10 flex h-2 cursor-ns-resize touch-none items-center justify-center focus-visible:outline-none"
      >
        <div
          className={cn(
            "h-1 w-10 rounded-full transition-opacity",
            isDragging
              ? "bg-muted-foreground/60 opacity-100"
              : "bg-border opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        />
      </div>
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
