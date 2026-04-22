import { Button, cn, Icon, Popover, PopoverContent, PopoverTrigger, Text, Textarea, useToast } from "@repo/ui"
import { SparklesIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { type KeyboardEvent, type MouseEvent, useState } from "react"
import { useSubmitEnrichmentReview } from "../../../../../../domains/product-feedback/product-feedback.collection.ts"

interface EnrichmentPopoverProps {
  readonly annotationId: string
  readonly rawFeedback: string
}

type Decision = "good" | "bad"

export function EnrichmentPopover({ annotationId, rawFeedback }: EnrichmentPopoverProps) {
  const { toast } = useToast()
  const submitMutation = useSubmitEnrichmentReview()
  const [open, setOpen] = useState(false)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [comment, setComment] = useState("")

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setDecision(null)
      setComment("")
    }
  }

  function pickDecision(kind: Decision) {
    return (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      setDecision(kind)
      setComment("")
    }
  }

  function submitReview() {
    if (decision === null) return

    const trimmed = comment.trim()
    if (decision === "bad" && trimmed.length === 0) return

    submitMutation.mutate({
      scoreId: annotationId,
      decision,
      ...(trimmed.length > 0 ? { comment: trimmed } : {}),
    })

    // Fire-and-forget UX per product direction: toast + close immediately, the
    // enqueue is fast and errors are logged server-side rather than blocking.
    toast({ description: "Review submitted" })
    setOpen(false)
    setDecision(null)
    setComment("")
  }

  function handleSubmit(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    submitReview()
  }

  const isBadInvalid = decision === "bad" && comment.trim().length === 0

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return
    if (!event.metaKey && !event.ctrlKey) return
    event.preventDefault()
    event.stopPropagation()
    if (isBadInvalid) return
    submitReview()
  }

  return (
    <div data-no-navigate>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Icon icon={SparklesIcon} size="xs" color="foregroundMuted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-96">
          <div className="flex flex-col gap-2">
            <Text.H5 className="whitespace-pre-wrap">{rawFeedback}</Text.H5>
            <span className="flex items-center gap-1">
              <Icon icon={SparklesIcon} size="xs" color="foregroundMuted" className="shrink-0" />
              <Text.H6 color="foregroundMuted">This feedback has been enriched with AI</Text.H6>
            </span>

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <Text.H6 color="foregroundMuted">
                Let Latitude know how this enrichment looks — your feedback helps us improve.
              </Text.H6>
              <div className="flex items-center gap-2">
                <Button
                  variant={decision === "good" ? "default-soft" : "outline"}
                  size="sm"
                  onClick={pickDecision("good")}
                  aria-label="Good enrichment"
                  aria-pressed={decision === "good"}
                >
                  <Icon
                    icon={ThumbsUpIcon}
                    size="xs"
                    className={cn({ "text-success-foreground": decision === "good" })}
                  />
                </Button>
                <Button
                  variant={decision === "bad" ? "destructive-soft" : "outline"}
                  size="sm"
                  onClick={pickDecision("bad")}
                  aria-label="Bad enrichment"
                  aria-pressed={decision === "bad"}
                >
                  <Icon
                    icon={ThumbsDownIcon}
                    size="xs"
                    className={cn({ "text-destructive-foreground": decision === "bad" })}
                  />
                </Button>
              </div>

              {decision !== null && (
                <>
                  <Textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder={
                      decision === "bad"
                        ? "Tell us what was wrong with this enrichment…"
                        : "Optional: add a note on what worked well."
                    }
                    minRows={3}
                    maxRows={6}
                    autoFocus
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSubmit} disabled={isBadInvalid}>
                      Save
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
