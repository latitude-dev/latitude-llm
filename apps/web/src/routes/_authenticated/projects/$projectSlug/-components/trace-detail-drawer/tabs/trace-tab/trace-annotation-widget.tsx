import { Button, cn, Text, Textarea } from "@repo/ui"
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useState } from "react"
import {
  useAnnotationsByTrace,
  useCreateAnnotation,
} from "../../../../../../../../domains/annotations/annotations.collection.ts"
import { AnnotationEditor } from "../../-components/annotation-editor.tsx"

// New annotation form — thumb + optional comment, no existing annotation yet.
function NewAnnotationForm({
  projectId,
  traceId,
  onDone,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly onDone: () => void
}) {
  const [passed, setPassed] = useState<boolean | null>(null)
  const [comment, setComment] = useState("")
  const createMutation = useCreateAnnotation()

  function handleSave() {
    if (passed === null || createMutation.isPending) return
    createMutation.mutate(
      {
        projectId,
        traceId,
        value: passed ? 1 : 0,
        passed,
        feedback: comment.trim() || " ",
        // No anchor — trace-level annotation.
      },
      { onSuccess: onDone },
    )
  }

  return (
    <div className="flex flex-col gap-2 border border-dashed border-border rounded-md p-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPassed(true)}
          className={cn("flex items-center rounded-md p-1.5 transition-colors", {
            "text-emerald-600 bg-emerald-100 dark:bg-emerald-400/20": passed === true,
            "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50": passed !== true,
          })}
        >
          <ThumbsUpIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPassed(false)}
          className={cn("flex items-center rounded-md p-1.5 transition-colors", {
            "text-red-600 bg-red-100 dark:bg-red-400/20": passed === false,
            "text-muted-foreground hover:text-red-600 hover:bg-red-50": passed !== false,
          })}
        >
          <ThumbsDownIcon className="h-4 w-4" />
        </button>
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment... (optional)"
        rows={3}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={passed === null || createMutation.isPending}
          isLoading={createMutation.isPending}
          onClick={handleSave}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
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
      {traceLevelAnnotations.map((annotation) => (
        // Re-key on annotation id so AnnotationEditor local state resets when annotation changes.
        <div key={annotation.id} className="border border-border rounded-md p-2">
          <AnnotationEditor annotation={annotation} projectId={projectId} traceId={traceId} />
        </div>
      ))}

      {showNewForm ? (
        <NewAnnotationForm projectId={projectId} traceId={traceId} onDone={() => setShowNewForm(false)} />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowNewForm(true)}>
          + Add annotation
        </Button>
      )}
    </div>
  )
}
