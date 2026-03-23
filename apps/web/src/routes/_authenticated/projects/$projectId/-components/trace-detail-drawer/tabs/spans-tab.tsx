import { Text } from "@repo/ui"
import { useCallback, useRef, useState } from "react"
import { useSpansByTraceCollection } from "../../../../../../../domains/spans/spans.collection.ts"
import { SpanDetail } from "./spans-tab/span-detail/index.tsx"
import { SpanTree, scrollSpanIntoView } from "./spans-tab/span-tree/index.tsx"

export function SpansTab({ projectId: _, traceId }: { readonly projectId: string; readonly traceId: string }) {
  const { data: spans } = useSpansByTraceCollection(traceId)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const treeContainerRef = useRef<HTMLDivElement | null>(null)

  const handleSelectSpan = useCallback((spanId: string) => {
    setSelectedSpanId((prev) => {
      if (spanId === prev) {
        setIsMinimized(false)
        return null
      }
      setIsMinimized(true)
      requestAnimationFrame(() => {
        scrollSpanIntoView(treeContainerRef.current, spanId)
      })
      return spanId
    })
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedSpanId(null)
    setIsMinimized(false)
  }, [])

  const handleToggleMinimized = useCallback(() => {
    setIsMinimized((prev) => !prev)
  }, [])

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
      {selectedSpanId && <SpanDetail traceId={traceId} spanId={selectedSpanId} onClose={handleCloseDetail} />}
    </div>
  )
}
