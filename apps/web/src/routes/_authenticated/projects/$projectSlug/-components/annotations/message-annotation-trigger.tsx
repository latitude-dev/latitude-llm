import { AvatarGroup, Icon, Popover, PopoverTrigger, Text } from "@repo/ui"
import { MessageSquarePlusIcon, MessageSquareTextIcon } from "lucide-react"
import { useState } from "react"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { AnnotationPopoverContent, AnnotationPopoverWrapper } from "./annotation-popover-content.tsx"
import { type AnnotationFormData, useTraceAnnotationsData } from "./hooks/use-trace-annotations-data.ts"

interface Annotator {
  readonly id: string
  readonly name: string
  readonly imageSrc: string | null
}

export function MessageAnnotationTrigger({
  messageIndex,
  projectId,
  traceId,
  spanId,
  annotations,
  annotators,
}: {
  readonly messageIndex: number
  readonly projectId: string
  readonly traceId: string
  readonly spanId?: string | undefined
  readonly annotations: readonly AnnotationRecord[]
  readonly annotators: readonly Annotator[]
}) {
  const [open, setOpen] = useState(false)
  const { createAnnotation, updateAnnotation, isCreatePending, isUpdatePending } = useTraceAnnotationsData({
    projectId,
    traceId,
  })

  const hasAnnotations = annotations.length > 0

  function handleSave(data: AnnotationFormData) {
    createAnnotation({ ...data, anchor: { messageIndex }, spanId: spanId ?? null }, { onSuccess: () => setOpen(false) })
  }

  function handleUpdate(annotationId: string, data: AnnotationFormData) {
    updateAnnotation(annotationId, data, {
      onSuccess: () => setOpen(false),
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-message-annotation-trigger={messageIndex}
          className="group flex items-center gap-1.5 rounded-md p-1.5 transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          {hasAnnotations ? (
            <>
              <Icon icon={MessageSquareTextIcon} size="sm" />
              {annotators.length > 0 && <AvatarGroup items={annotators} maxVisible={3} size="xs" />}
              <Text.H6 color="foregroundMuted" className="hidden group-hover:inline">
                Edit annotations
              </Text.H6>
            </>
          ) : (
            <>
              <Icon icon={MessageSquarePlusIcon} size="sm" />
              <Text.H6 color="foregroundMuted" className="hidden group-hover:inline">
                Add annotation
              </Text.H6>
            </>
          )}
        </button>
      </PopoverTrigger>
      <AnnotationPopoverWrapper>
        <AnnotationPopoverContent
          projectId={projectId}
          annotations={annotations}
          isCreateLoading={isCreatePending}
          isUpdateLoading={isUpdatePending}
          onSave={handleSave}
          onUpdate={handleUpdate}
        />
      </AnnotationPopoverWrapper>
    </Popover>
  )
}
