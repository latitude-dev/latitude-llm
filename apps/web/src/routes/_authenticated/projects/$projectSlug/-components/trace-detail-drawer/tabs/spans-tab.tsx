import { Text } from "@repo/ui"
import { useRef, useState } from "react"
import { useSpansByTraceCollection } from "../../../../../../../domains/spans/spans.collection.ts"
import { SpanDetail } from "./spans-tab/span-detail/index.tsx"
import { SpanTree } from "./spans-tab/span-tree/index.tsx"

export function SpansTab({
  traceId,
  selectedSpanId,
  onSelectSpan,
  isActive,
}: {
  readonly traceId: string
  readonly selectedSpanId: string
  readonly onSelectSpan: (spanId: string) => void
  readonly isActive: boolean
}) {
  const { data: spans } = useSpansByTraceCollection(traceId)
  const [isMinimized, setIsMinimized] = useState(() => selectedSpanId !== "")
  const treeContainerRef = useRef<HTMLDivElement | null>(null)

  function handleSelectSpan(spanId: string) {
    if (spanId === selectedSpanId) {
      onSelectSpan("")
      setIsMinimized(false)
    } else {
      onSelectSpan(spanId)
    }
  }

  function handleCloseDetail() {
    onSelectSpan("")
    setIsMinimized(false)
  }

  function handleToggleMinimized() {
    setIsMinimized((prev) => !prev)
  }

  if (!spans) {
    return (
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">Loading spans...</Text.H5>
      </div>
    )
  }

  if (spans.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">No spans found</Text.H5>
      </div>
    )
  }

  return (
    <div ref={treeContainerRef} className="flex flex-col flex-1 overflow-hidden">
      <SpanTree
        spans={spans}
        selectedSpanId={selectedSpanId}
        onSelectSpan={handleSelectSpan}
        isMinimized={isMinimized}
        onToggleMinimized={handleToggleMinimized}
        isActive={isActive}
        scrollIntoViewRootRef={treeContainerRef}
        onBeforeScrollToSelectedSpan={() => setIsMinimized(true)}
      />
      {selectedSpanId !== "" && <SpanDetail traceId={traceId} spanId={selectedSpanId} onClose={handleCloseDetail} />}
    </div>
  )
}
