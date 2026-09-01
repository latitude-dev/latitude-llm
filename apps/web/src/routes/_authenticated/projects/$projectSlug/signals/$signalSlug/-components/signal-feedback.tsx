import type { SignalFeedback as SignalFeedbackRecord } from "@domain/signals"
import {
  Button,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Text,
  Textarea,
  ThumbButton,
  Tooltip,
  useToast,
} from "@repo/ui"
import { type KeyboardEvent, type MouseEvent, useState } from "react"
import { useSubmitSignalFeedback } from "../../../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"

interface SignalFeedbackProps {
  readonly projectId: string
  readonly signalId: string
  readonly feedback: SignalFeedbackRecord | null
  readonly disabled: boolean
}

const CONFIRMED_TOOLTIP = "Marked as a real problem"
const REJECTED_TOOLTIP = "Marked as a false positive"

export function SignalFeedback({ projectId, signalId, feedback, disabled }: SignalFeedbackProps) {
  const { toast } = useToast()
  const submitMutation = useSubmitSignalFeedback(projectId, signalId)
  const [passed, setPassed] = useState<boolean | null>(null)
  const [reason, setReason] = useState("")

  if (feedback !== null) {
    return (
      <Tooltip
        asChild
        side="bottom"
        trigger={
          <span className="flex">
            {/* One-shot verdict: the filled thumb is a read-out, not a control. */}
            <ThumbButton selected variant={feedback.passed ? "up" : "down"} readOnly onClick={() => undefined} />
          </span>
        }
      >
        {feedback.feedback.length > 0 ? feedback.feedback : feedback.passed ? CONFIRMED_TOOLTIP : REJECTED_TOOLTIP}
      </Tooltip>
    )
  }

  const isReasonMissing = passed === false && reason.trim().length === 0

  function pickVerdict(next: boolean) {
    return (event: MouseEvent) => {
      event.preventDefault()
      setPassed(next)
      setReason("")
    }
  }

  function close() {
    setPassed(null)
    setReason("")
  }

  function submit(ignore: boolean) {
    if (passed === null || isReasonMissing || submitMutation.isPending) return

    const trimmed = reason.trim()
    submitMutation.mutate(
      { passed, ...(trimmed.length > 0 ? { feedback: trimmed } : {}), ...(ignore ? { ignore: true } : {}) },
      {
        onSuccess: (result) => {
          toast({
            description: result.ignored
              ? "Thank you for helping us make Latitude better. Signal ignored."
              : "Thank you for helping us make Latitude better.",
          })
          close()
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    )
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    submit(false)
  }

  return (
    <Popover open={passed !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <PopoverAnchor asChild>
        <div className="flex items-center gap-1">
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <span className="flex">
                <ThumbButton selected={passed === true} variant="up" onClick={pickVerdict(true)} disabled={disabled} />
              </span>
            }
          >
            This signal is a real problem
          </Tooltip>
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <span className="flex">
                <ThumbButton
                  selected={passed === false}
                  variant="down"
                  onClick={pickVerdict(false)}
                  disabled={disabled}
                />
              </span>
            }
          >
            This is a false positive
          </Tooltip>
        </div>
      </PopoverAnchor>
      <PopoverContent side="bottom" align="end" className="w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col gap-2">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={passed === false ? "What made this a false positive?" : "What made this signal useful?"}
            minRows={3}
            maxRows={6}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <Text.H6 color="foregroundMuted" className="min-w-0">
              Feedback helps us improve how we detect signals.
            </Text.H6>
            {passed === false ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="outline"
                  className="whitespace-nowrap"
                  onClick={() => submit(false)}
                  disabled={isReasonMissing || submitMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  className="whitespace-nowrap"
                  onClick={() => submit(true)}
                  disabled={isReasonMissing || submitMutation.isPending}
                >
                  Save and ignore
                </Button>
              </div>
            ) : (
              <Button
                className="shrink-0 whitespace-nowrap"
                onClick={() => submit(false)}
                disabled={submitMutation.isPending}
              >
                Save
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
