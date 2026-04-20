import { AvatarGroup, Button, Popover, PopoverAnchor, ThumbButton } from "@repo/ui"
import type { MouseEvent } from "react"
import { useMemo, useState } from "react"
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
  messageRole,
  projectId,
  traceId,
  spanId,
  annotations,
  annotators,
  onClose,
}: {
  readonly messageIndex: number
  readonly messageRole: string
  readonly projectId: string
  readonly traceId: string
  readonly spanId?: string | undefined
  readonly annotations: readonly AnnotationRecord[]
  readonly annotators: readonly Annotator[]
  readonly onClose?: (() => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const [selectedThumb, setSelectedThumb] = useState<boolean | null>(null)
  const { createAnnotation, updateAnnotation, isCreatePending, isUpdatePending } = useTraceAnnotationsData({
    projectId,
    traceId,
  })

  const { positiveAnnotators, negativeAnnotators } = useMemo(() => {
    const annotatorById = new Map(annotators.map((a) => [a.id, a]))
    const seen = { up: new Set<string>(), down: new Set<string>() }
    const positive: Annotator[] = []
    const negative: Annotator[] = []
    for (const a of annotations) {
      const annotator = a.annotatorId ? annotatorById.get(a.annotatorId) : undefined
      if (!annotator) continue

      const bucket = a.passed ? "up" : "down"
      if (seen[bucket].has(annotator.id)) continue

      seen[bucket].add(annotator.id)
      const target = a.passed ? positive : negative
      target.push(annotator)
    }
    return { positiveAnnotators: positive, negativeAnnotators: negative }
  }, [annotations, annotators])

  const hasPositive = positiveAnnotators.length > 0
  const hasNegative = negativeAnnotators.length > 0

  function closePopover() {
    setOpen(false)
    setSelectedThumb(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true)
      return
    }
    closePopover()
    onClose?.()
  }

  function handleThumbClick(event: MouseEvent<HTMLButtonElement>, passed: boolean) {
    event.stopPropagation()
    setSelectedThumb(passed)
    setOpen(true)
  }

  function handleViewClick(event: MouseEvent<HTMLElement>) {
    event.stopPropagation()
    setSelectedThumb(null)
    setOpen(true)
  }

  function handleSave(data: AnnotationFormData) {
    createAnnotation({ ...data, anchor: { messageIndex }, spanId: spanId ?? null }, { onSuccess: closePopover })
  }

  function handleUpdate(annotationId: string, data: AnnotationFormData) {
    updateAnnotation(annotationId, data, { onSuccess: closePopover })
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: inner thumb/avatar buttons already provide keyboard access; this onClick exists only as a single DOM target for programmatic annotation navigation */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: this wrapper cannot be a <button> because it contains thumb/avatar buttons — interactive children preclude a semantic button element */}
        <div
          className="flex items-center gap-1"
          data-message-annotation-trigger={messageIndex}
          onClick={handleViewClick}
        >
          <div className="flex items-center gap-1">
            <ThumbButton
              selected={hasPositive || selectedThumb === true}
              variant="up"
              appearance="icon"
              onClick={(e) => handleThumbClick(e, true)}
              disabled={isCreatePending}
            />
            {hasPositive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewClick}
                aria-label="View positive annotations"
                className="px-0"
              >
                <AvatarGroup items={positiveAnnotators} maxVisible={3} size="xs" disableTooltips />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <ThumbButton
              selected={hasNegative || selectedThumb === false}
              variant="down"
              appearance="icon"
              onClick={(e) => handleThumbClick(e, false)}
              disabled={isCreatePending}
            />
            {hasNegative && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewClick}
                aria-label="View negative annotations"
                className="px-0"
              >
                <AvatarGroup items={negativeAnnotators} maxVisible={3} size="xs" disableTooltips />
              </Button>
            )}
          </div>
        </div>
      </PopoverAnchor>
      <AnnotationPopoverWrapper align={messageRole === "user" ? "end" : "start"}>
        <AnnotationPopoverContent
          projectId={projectId}
          annotations={annotations}
          createInitialPassed={selectedThumb}
          createAutoFocus={selectedThumb !== null}
          isCreateLoading={isCreatePending}
          isUpdateLoading={isUpdatePending}
          onSave={handleSave}
          onUpdate={handleUpdate}
        />
      </AnnotationPopoverWrapper>
    </Popover>
  )
}
