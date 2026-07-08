import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useState } from "react"
import { toUserMessage } from "../../../../lib/errors.ts"

interface ShowcaseActionButtonProps {
  /** Button label (also the modal title). */
  readonly label: string
  /** One-line modal subtitle. */
  readonly description: string
  /** Warning-alert body spelling out what the action does. */
  readonly confirmBody: string
  /** Toast title shown when the action throws. */
  readonly errorTitle: string
  readonly variant?: "default" | "outline"
  readonly disabled?: boolean
  /** Runs the mutation and returns the success-toast message. */
  readonly run: () => Promise<string>
  /**
   * Refresh the pointer-state card after a successful mutation. This page is
   * driven by React Query (not a route loader), so `router.invalidate()` would
   * be a no-op — the parent passes a `queryClient.invalidateQueries` here.
   */
  readonly onSuccess: () => void | Promise<void>
}

/**
 * Generic confirm-then-run button for the backoffice showcase actions
 * (Create / Regenerate / Swap / Retry). Each action is a single global
 * mutation behind a warning modal — the same shape as the org-level actions
 * (`create-demo-project`, `reset-system-monitors`) — so they share this shell
 * and differ only in copy and the `run` callback.
 */
export function ShowcaseActionButton({
  label,
  description,
  confirmBody,
  errorTitle,
  variant = "outline",
  disabled = false,
  run,
  onSuccess,
}: ShowcaseActionButtonProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const onConfirm = async () => {
    setIsPending(true)
    try {
      const message = await run()
      toast({ description: message })
      setIsOpen(false)
      await onSuccess()
    } catch (error) {
      toast({ variant: "destructive", title: errorTitle, description: toUserMessage(error) })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <Button variant={variant} size="sm" disabled={disabled} onClick={() => setIsOpen(true)}>
        {label}
      </Button>
      <Modal.Root open={isOpen} onOpenChange={setIsOpen}>
        <Modal.Content dismissible size="large">
          <Modal.Header title={label} description={<Text.H5 color="foregroundMuted">{description}</Text.H5>} />
          <Modal.Body>
            <Alert variant="warning" description={confirmBody} />
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger>
              <Button variant="outline" size="sm">
                Close
              </Button>
            </CloseTrigger>
            <Button size="sm" onClick={() => void onConfirm()} disabled={isPending}>
              {isPending ? "Working…" : label}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
