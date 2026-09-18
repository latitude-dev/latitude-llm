import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminRecalculateAgentScore } from "../../../../domains/admin/agent-score.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface AgentScoreRecalculateButtonProps {
  readonly projectId: string
  readonly projectName: string
}

/**
 * Recomputes this project's Agent Score now rather than at the next daily sweep.
 *
 * The useful half is the explanation: the cause rows and coverage the page shows come from a cache
 * the daily job warms, so after changing a detector, a signal or a flagger's sampling this is how
 * staff see the effect today instead of tomorrow. The modal says what it will and will not change,
 * because "recalculate" reads like it might rewrite the number and it cannot.
 */
export function AgentScoreRecalculateButton({ projectId, projectName }: AgentScoreRecalculateButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const { date } = await adminRecalculateAgentScore({ data: { projectId } })
      toast({
        description: `Agent Score recalculation enqueued for ${projectName} (${date}). The evidence refreshes when the worker finishes.`,
      })
      setIsOpen(false)
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not recalculate the Agent Score",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Recalculate Agent Score
      </Button>
      <Modal.Root open={isOpen} onOpenChange={setIsOpen}>
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Recalculate Agent Score"
            description={
              <Text.H5 color="foregroundMuted">
                Recompute today's Agent Score for <span className="font-medium text-foreground">{projectName}</span> and
                refresh the cause rows and coverage the page shows.
              </Text.H5>
            }
          />
          <Modal.Body>
            <Text.H5 color="foregroundMuted">
              This reads every eligible session in the project's window, so it takes longer than most backoffice actions
              and runs on the worker rather than here.
            </Text.H5>
            <Alert
              variant="warning"
              description="A score already published for today will not change. The stored score records what was published on that date; only the evidence explaining it is refreshed. A day with no score can still gain one."
            />
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="button" size="sm" disabled={isSubmitting} onClick={() => void handleConfirm()}>
              {isSubmitting ? "Enqueueing…" : "Recalculate"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
