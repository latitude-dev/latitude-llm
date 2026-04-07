import { Button, Text } from "@repo/ui"
import { useState } from "react"
import {
  useAnnotationsByTrace,
  useCreateAnnotation,
} from "../../../../../../../../domains/annotations/annotations.collection.ts"
import { AnnotationEditor } from "../../-components/annotation-editor.tsx"
import { AnnotationThumbToggle } from "../../-components/annotation-thumb-toggle.tsx"

/** Creates a draft via API on thumb choice; the list then shows `AnnotationEditor` for that row. */
function NewTraceAnnotationPicker({
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
    <div className="border border-dashed border-border rounded-md p-2">
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

export function TraceAnnotationWidget({
  projectId,
  traceId,
}: {
  readonly projectId: string
  readonly traceId: string
}) {
  const { data: annotations } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
  })

  const [showNewForm, setShowNewForm] = useState(false)

  // Trace-level: no anchor fields set.
  const traceLevelAnnotations =
    annotations?.items.filter(
      (a) =>
        a.metadata.messageIndex === undefined &&
        a.metadata.partIndex === undefined &&
        a.metadata.startOffset === undefined &&
        a.metadata.endOffset === undefined,
    ) ?? []

  if (!annotations) {
    return <Text.H6 color="foregroundMuted">Loading…</Text.H6>
  }

  return (
    <div className="flex flex-col gap-3">
      {showNewForm ? (
        <NewTraceAnnotationPicker projectId={projectId} traceId={traceId} onCancel={() => setShowNewForm(false)} />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowNewForm(true)}>
          + Add annotation
        </Button>
      )}

      {traceLevelAnnotations.map((annotation) => (
        <div
          key={`${annotation.id}:${annotation.draftedAt !== null ? "draft" : "pub"}`}
          className="border border-border rounded-md p-2"
        >
          <AnnotationEditor annotation={annotation} projectId={projectId} traceId={traceId} listStartsCompact />
        </div>
      ))}
    </div>
  )
}
