import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminSendAgentScoreDigest } from "../../../../domains/admin/agent-score-digest.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface AgentScoreDigestButtonProps {
  readonly projectId: string
  readonly projectName: string
}

/**
 * Sends this project's weekly Agent Score digest now rather than at Monday's cron.
 *
 * A weekly schedule is only observable once a week, so this is how the pipeline gets exercised. The
 * modal says what decides whether anything ships, because the button enqueues a producer run rather
 * than an email: a project that published no score in the window sends nothing.
 */
export function AgentScoreDigestButton({ projectId, projectName }: AgentScoreDigestButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const { windowStart, windowEnd } = await adminSendAgentScoreDigest({ data: { projectId } })
      toast({
        description: `Weekly digest enqueued for ${projectName} (${windowStart} to ${windowEnd}). Members receive it if the project published a score in that window.`,
      })
      setIsOpen(false)
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not send the weekly digest",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Send weekly digest
      </Button>
      <Modal.Root open={isOpen} onOpenChange={setIsOpen}>
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Send the weekly Agent Score digest"
            description={
              <Text.H5 color="foregroundMuted">
                Send the weekly Agent Score digest for{" "}
                <span className="font-medium text-foreground">{projectName}</span> now, over the same seven-day window
                the Monday cron would resolve today.
              </Text.H5>
            }
          />
          <Modal.Body>
            <Text.H5 color="foregroundMuted">
              Every member of the organization receives a notification, and an email unless they turned the Agent Score
              group off.
            </Text.H5>
            <Alert
              variant="warning"
              description="Nothing is sent if the project published no score in the last seven days. Unscored days are gaps rather than zeros, so a project that misses its coverage floors has nothing to report."
            />
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="button" size="sm" disabled={isSubmitting} onClick={() => void handleConfirm()}>
              {isSubmitting ? "Sending…" : "Send"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
