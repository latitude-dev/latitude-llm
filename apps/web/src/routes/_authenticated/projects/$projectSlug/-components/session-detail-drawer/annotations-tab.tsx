import { Text } from "@repo/ui"
import {
  useAnnotationsBySession,
  useCreateAnnotation,
  useUpdateAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import { AnnotationList } from "../annotations/annotation-list.tsx"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"

/**
 * Session-wide annotations — the same surface as the trace drawer's
 * `TraceAnnotationsList`, reusing `AnnotationList`. Annotations attach to a
 * trace, so the create form targets the session's *latest* trace (its current
 * conversation); editing targets each annotation's own trace. A "Trace N" label
 * marks which trace each annotation belongs to, and a click routes to the
 * Conversation tab (latest trace) or slides into an older trace's slot.
 */
export function AnnotationsTab({
  projectId,
  traceIds,
  latestTraceId,
  traceNumberById,
  onOpenInConversation,
  onOpenTrace,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly latestTraceId: string
  readonly traceNumberById: ReadonlyMap<string, number>
  /** Inline annotation on the latest trace → switch to the Conversation tab. */
  readonly onOpenInConversation: (annotationId: string) => void
  /** Inline annotation on an older trace → slide into its trace slot, focused on it. */
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
}) {
  const { data, isLoading, isError } = useAnnotationsBySession({ projectId, traceIds })
  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()

  return (
    <AnnotationList
      projectId={projectId}
      annotations={data?.items ?? []}
      isLoading={isLoading}
      isError={isError}
      showCreateForm={latestTraceId.length > 0}
      createPending={createMutation.isPending}
      onCreate={(annotationData) => {
        if (!latestTraceId) return
        createMutation.mutate({
          projectId,
          traceId: latestTraceId,
          value: annotationData.passed ? 1 : 0,
          passed: annotationData.passed,
          feedback: annotationData.comment || " ",
          ...(annotationData.issueId ? { issueId: annotationData.issueId } : {}),
        })
      }}
      updatePending={updateMutation.isPending}
      onUpdate={(annotation, annotationData) => {
        const traceId = annotation.traceId ?? ""
        if (!traceId) return
        updateMutation.mutate({
          scoreId: annotation.id,
          projectId,
          traceId,
          value: annotationData.passed ? 1 : 0,
          passed: annotationData.passed,
          feedback: annotationData.comment || " ",
          issueId: annotationData.issueId ?? undefined,
        })
      }}
      onAnnotationClick={(annotation) => {
        const traceId = annotation.traceId ?? ""
        if (!traceId) return
        if (traceId === latestTraceId) onOpenInConversation(annotation.id)
        else onOpenTrace(traceId, { focusAnnotationId: annotation.id })
      }}
      renderItemAccessory={(annotation) => {
        const traceNumber = traceNumberById.get(annotation.traceId ?? "")
        return traceNumber !== undefined ? (
          <Text.H6 color="foregroundMuted" className="px-3 pt-1">
            Trace {traceNumber}
          </Text.H6>
        ) : null
      }}
    />
  )
}
