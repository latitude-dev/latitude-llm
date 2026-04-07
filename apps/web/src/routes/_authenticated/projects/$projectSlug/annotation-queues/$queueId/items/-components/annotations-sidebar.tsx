import { Button, Skeleton, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useState } from "react"
import {
  useAnnotationsByTrace,
  useCreateAnnotation,
} from "../../../../../../../../domains/annotations/annotations.collection.ts"
import {
  type AnnotationRecord,
  isDraftAnnotation,
} from "../../../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationEditor } from "../../../../-components/trace-detail-drawer/-components/annotation-editor.tsx"
import { AnnotationThumbToggle } from "../../../../-components/trace-detail-drawer/-components/annotation-thumb-toggle.tsx"

function NewAnnotationPicker({
  projectId,
  traceId,
  onCancel,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly onCancel: () => void
}) {
  const createMutation = useCreateAnnotation()

  function handleThumb(passed: boolean) {
    if (createMutation.isPending) return
    createMutation.mutate(
      {
        projectId,
        traceId,
        value: passed ? 1 : 0,
        passed,
        feedback: " ",
      },
      { onSuccess: onCancel },
    )
  }

  return (
    <div className="border border-dashed border-border rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <AnnotationThumbToggle
          passed={null}
          disabled={createMutation.isPending}
          onThumbUp={() => handleThumb(true)}
          onThumbDown={() => handleThumb(false)}
        />
        <Button variant="ghost" size="sm" disabled={createMutation.isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AnnotationCard({
  annotation,
  projectId,
  traceId,
}: {
  readonly annotation: AnnotationRecord
  readonly projectId: string
  readonly traceId: string
}) {
  const isDraft = isDraftAnnotation(annotation)
  const createdAt = new Date(annotation.createdAt)

  return (
    <div className="border border-border rounded-md p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">{relativeTime(createdAt)}</Text.H6>
        {isDraft && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Draft
          </span>
        )}
      </div>
      <AnnotationEditor annotation={annotation} projectId={projectId} traceId={traceId} listStartsCompact />
    </div>
  )
}

export function AnnotationsSidebar({
  instructions,
  projectId,
  traceId,
  isLoading,
}: {
  readonly instructions: string
  readonly projectId: string
  readonly traceId: string
  readonly isLoading: boolean
}) {
  const { data: annotationsData, isLoading: annotationsLoading } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
  })

  const [showNewForm, setShowNewForm] = useState(false)

  const annotations: readonly AnnotationRecord[] = annotationsData?.items ?? []
  const sortedAnnotations = [...annotations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Instructions section */}
      <div className="flex flex-col gap-3 p-4 border-b border-border shrink-0">
        <Text.H5M>Instructions</Text.H5M>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : instructions.trim() ? (
          <Text.H6 color="foregroundMuted" className="whitespace-pre-wrap">
            {instructions}
          </Text.H6>
        ) : (
          <Text.H6 color="foregroundMuted" italic>
            No instructions provided
          </Text.H6>
        )}
      </div>

      {/* Annotations section */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-4 pb-2 shrink-0">
          <Text.H5M>Annotations</Text.H5M>
          <Text.H6 color="foregroundMuted">{annotations.length} total</Text.H6>
        </div>

        <div className="flex flex-col gap-3 p-4 pt-2 overflow-y-auto flex-1">
          {showNewForm ? (
            <NewAnnotationPicker projectId={projectId} traceId={traceId} onCancel={() => setShowNewForm(false)} />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowNewForm(true)} className="w-full">
              + Add annotation
            </Button>
          )}

          {annotationsLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : sortedAnnotations.length > 0 ? (
            sortedAnnotations.map((annotation) => (
              <AnnotationCard
                key={`${annotation.id}:${annotation.draftedAt !== null ? "draft" : "pub"}`}
                annotation={annotation}
                projectId={projectId}
                traceId={traceId}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Text.H6 color="foregroundMuted" italic>
                No annotations yet
              </Text.H6>
              <Text.H6 color="foregroundMuted">
                Select text in the conversation or use the button above to add one.
              </Text.H6>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
