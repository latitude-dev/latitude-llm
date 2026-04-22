import { Button, Icon, Popover, PopoverAnchor, PopoverContent, Text, Textarea, Tooltip, useToast } from "@repo/ui"
import { InfoIcon, SparklesIcon } from "lucide-react"
import { type KeyboardEvent, type MouseEvent, useState } from "react"
import {
  useApproveSystemAnnotation,
  useRejectSystemAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"

interface AnnotationApprovalPopoverProps {
  readonly annotationId: string
  readonly onAction?: (() => void) | undefined
}

type Decision = "approve" | "reject"

export function AnnotationApprovalPopover({ annotationId, onAction }: AnnotationApprovalPopoverProps) {
  const { toast } = useToast()
  const approveMutation = useApproveSystemAnnotation()
  const rejectMutation = useRejectSystemAnnotation()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [comment, setComment] = useState("")

  const isSubmitting = approveMutation.isPending || rejectMutation.isPending

  function openFor(kind: Decision) {
    return (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      setComment("")
      setDecision(kind)
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) return
    if (isSubmitting) return
    setDecision(null)
    setComment("")
  }

  function submitReview() {
    if (decision === null) return

    const trimmed = comment.trim()

    if (decision === "approve") {
      approveMutation.mutate(
        { scoreId: annotationId, ...(trimmed.length > 0 ? { comment: trimmed } : {}) },
        {
          onSuccess: () => {
            toast({ description: "Review submitted" })
            onAction?.()
          },
          onError: () => {
            toast({ variant: "destructive", description: "Failed to submit review. Please try again." })
          },
        },
      )
    } else {
      if (trimmed.length === 0) return
      rejectMutation.mutate(
        { scoreId: annotationId, comment: trimmed },
        {
          onSuccess: () => {
            toast({ description: "Review submitted" })
            onAction?.()
          },
          onError: () => {
            toast({ variant: "destructive", description: "Failed to submit review. Please try again." })
          },
        },
      )
    }

    setDecision(null)
    setComment("")
  }

  function handleSubmit(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    submitReview()
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return
    if (!event.metaKey && !event.ctrlKey) return
    event.preventDefault()
    event.stopPropagation()
    if (isRejectInvalid || isSubmitting) return
    submitReview()
  }

  const isRejectInvalid = decision === "reject" && comment.trim().length === 0

  return (
    <Popover open={decision !== null} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div className="flex items-center gap-2" data-no-navigate data-annotation-approval-buttons={annotationId}>
          <Tooltip
            asChild
            trigger={
              <span className="inline-flex items-center text-muted-foreground">
                <Icon icon={InfoIcon} size="xs" color="foregroundMuted" />
              </span>
            }
          >
            <span className="flex items-center gap-1">
              <Icon icon={SparklesIcon} size="sm" className="shrink-0 stroke-[1.5]" />
              Automatically generated with AI
            </span>
          </Tooltip>
          <Button variant="destructive-soft" size="sm" onClick={openFor("reject")} disabled={isSubmitting}>
            Reject
          </Button>
          <Button variant="default-soft" size="sm" onClick={openFor("approve")} disabled={isSubmitting}>
            Approve
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent side="bottom" align="end" className="w-96">
        {decision !== null && (
          <div className="flex flex-col gap-2">
            <Text.H5 weight="semibold">Tell us why</Text.H5>
            <Text.H6 color="foregroundMuted">
              Your comment is sent to Latitude so we can improve our automatic annotations.
            </Text.H6>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={
                decision === "reject"
                  ? "Tell us what was wrong with this annotation…"
                  : "Optional: add a note on why this annotation looked right."
              }
              minRows={3}
              maxRows={6}
              autoFocus
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSubmit} disabled={isRejectInvalid} isLoading={isSubmitting}>
                Submit
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
