import { cn } from "@repo/ui"
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useState } from "react"
import { useCreateAnnotation } from "../../../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationEditor } from "../../-components/annotation-editor.tsx"
import { AnnotationForm } from "../../-components/annotation-form.tsx"

export function MessageAnnotationRow({
  messageIndex,
  projectId,
  traceId,
  spanId,
  existingAnnotation,
}: {
  readonly messageIndex: number
  readonly projectId: string
  readonly traceId: string
  readonly spanId?: string | undefined
  readonly existingAnnotation: AnnotationRecord | undefined
}) {
  const [formPassed, setFormPassed] = useState<boolean | null>(null)
  const [comment, setComment] = useState("")
  const [issueId, setIssueId] = useState<string | null>(null)
  const createMutation = useCreateAnnotation()

  function handlePassedClick(newPassed: boolean) {
    if (createMutation.isPending) return
    setFormPassed(newPassed)
  }

  function handleConfirm() {
    if (formPassed === null || createMutation.isPending) return
    createMutation.mutate(
      {
        projectId,
        traceId,
        ...(spanId ? { spanId } : {}),
        value: formPassed ? 1 : 0,
        passed: formPassed,
        feedback: comment.trim() || " ",
        ...(issueId ? { issueId } : {}),
        anchor: { messageIndex },
      },
      {
        onSuccess: () => {
          setFormPassed(null)
          setComment("")
          setIssueId(null)
        },
      },
    )
  }

  function handleCancel() {
    setFormPassed(null)
    setComment("")
    setIssueId(null)
  }

  if (existingAnnotation) {
    return (
      <div className="mt-1">
        <AnnotationEditor
          key={`${existingAnnotation.id}:${existingAnnotation.draftedAt !== null ? "draft" : "pub"}`}
          annotation={existingAnnotation}
          projectId={projectId}
          traceId={traceId}
          anchor={{ messageIndex }}
          listStartsCompact
        />
      </div>
    )
  }

  if (formPassed !== null) {
    return (
      <div className="mt-1 border border-dashed border-border rounded-md p-2">
        <AnnotationForm
          projectId={projectId}
          passed={formPassed}
          comment={comment}
          issueId={issueId}
          isLoading={createMutation.isPending}
          onPassedChange={setFormPassed}
          onCommentChange={setComment}
          onIssueChange={setIssueId}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        disabled={createMutation.isPending}
        onClick={() => handlePassedClick(true)}
        className={cn(
          "flex items-center rounded-md p-1 transition-colors",
          "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20",
        )}
      >
        <ThumbsUpIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={createMutation.isPending}
        onClick={() => handlePassedClick(false)}
        className={cn(
          "flex items-center rounded-md p-1 transition-colors",
          "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20",
        )}
      >
        <ThumbsDownIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
