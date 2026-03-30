import { Text } from "@repo/ui"
import { useEffect, useRef, useState } from "react"
import { useSpansByTraceCollection } from "../../../../../../../domains/spans/spans.collection.ts"
import { SpanDetail } from "./spans-tab/span-detail/index.tsx"
import { SpanTree, scrollSpanIntoView } from "./spans-tab/span-tree/index.tsx"

export function SpansTab({
  projectId: _,
  traceId,
  selectedSpanId,
  onSelectSpan,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly selectedSpanId: string
  readonly onSelectSpan: (spanId: string) => void
}) {
  const { data: spans } = useSpansByTraceCollection(traceId)
  const [isMinimized, setIsMinimized] = useState(() => selectedSpanId !== "")
  const treeContainerRef = useRef<HTMLDivElement | null>(null)

  // TODO(frontend-use-effect-policy): scrollSpanIntoView is an imperative DOM
  // operation that cannot be derived during render. It must fire both when
  // selectedSpanId changes externally (navigation from conversation tab) and
  // when spans first load with a pre-set selectedSpanId, so an event handler
  // alone is not sufficient.
  useEffect(() => {
    if (!selectedSpanId || !spans || spans.length === 0) return
    setIsMinimized(true)
    requestAnimationFrame(() => {
      scrollSpanIntoView(treeContainerRef.current, selectedSpanId)
    })
  }, [selectedSpanId, spans?.length])

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
      />
      {selectedSpanId !== "" && <SpanDetail traceId={traceId} spanId={selectedSpanId} onClose={handleCloseDetail} />}
    </div>
  )
}
