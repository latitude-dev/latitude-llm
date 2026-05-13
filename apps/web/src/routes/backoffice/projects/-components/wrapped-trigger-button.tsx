import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminTriggerClaudeCodeWrapped } from "../../../../domains/admin/claude-code-wrapped.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface WrappedTriggerButtonProps {
  readonly projectId: string
  readonly projectName: string
}

/**
 * Manually triggers a Claude Code Wrapped run for this project. The worker
 * decides — based on the org's `claude-code-wrapped` feature flag and the
 * presence of Claude Code spans — whether anything actually ships. The
 * confirmation modal calls that out so staff don't expect blind sends.
 */
export function WrappedTriggerButton({ projectId, projectName }: WrappedTriggerButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      await adminTriggerClaudeCodeWrapped({ data: { projectId } })
      toast({
        description: `Claude Code Wrapped enqueued for ${projectName}. Members receive an email if the flag is on and the project had activity this week.`,
      })
      setIsOpen(false)
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not enqueue Wrapped",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Run Claude Code Wrapped
      </Button>
      <Modal.Root open={isOpen} onOpenChange={setIsOpen}>
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Trigger Claude Code Wrapped"
            description={
              <Text.H5 color="foregroundMuted">
                Send the weekly Claude Code summary email for{" "}
                <span className="font-medium text-foreground">{projectName}</span> right now.
              </Text.H5>
            }
          />
          <Modal.Body>
            <Alert
              variant="warning"
              description="The worker only sends emails if the organization has the `claude-code-wrapped` feature flag enabled and the project recorded Claude Code activity in the last 7 days. Otherwise the job is logged as skipped."
            />
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="button" size="sm" disabled={isSubmitting} onClick={() => void handleConfirm()}>
              {isSubmitting ? "Enqueueing…" : "Enqueue"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
