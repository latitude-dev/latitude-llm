import { cn } from "@repo/ui"
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { useCreateAnnotation } from "../../../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationEditor } from "../../-components/annotation-editor.tsx"

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
  const createMutation = useCreateAnnotation()

  function handleCreateThumb(newPassed: boolean) {
    if (createMutation.isPending) return
    createMutation.mutate({
      projectId,
      traceId,
      ...(spanId ? { spanId } : {}),
      value: newPassed ? 1 : 0,
      passed: newPassed,
      feedback: " ",
      anchor: { messageIndex },
    })
  }

  if (existingAnnotation) {
    return (
      <div className="mt-1">
        <AnnotationEditor
          annotation={existingAnnotation}
          projectId={projectId}
          traceId={traceId}
          anchor={{ messageIndex }}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        disabled={createMutation.isPending}
        onClick={() => handleCreateThumb(true)}
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
        onClick={() => handleCreateThumb(false)}
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
