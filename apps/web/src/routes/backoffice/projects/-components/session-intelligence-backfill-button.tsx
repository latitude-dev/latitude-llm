import { Alert, Button, CloseTrigger, Input, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminBackfillSessionIntelligence } from "../../../../domains/admin/session-intelligence.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

const CONFIRMATION_PHRASE = "reset session intelligence"

interface SessionIntelligenceBackfillButtonProps {
  readonly projectId: string
  readonly projectName: string
}

export function SessionIntelligenceBackfillButton({ projectId, projectName }: SessionIntelligenceBackfillButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isConfirmed = confirmText.toLowerCase() === CONFIRMATION_PHRASE

  const close = () => {
    setIsOpen(false)
    setConfirmText("")
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const result = await adminBackfillSessionIntelligence({
        data: { projectId, confirmation: CONFIRMATION_PHRASE },
      })
      toast({
        description: `Backfill workflow started for ${projectName}. It will reset session intelligence, analyze up to ${result.sessionLimit.toLocaleString()} recent sessions, then garden taxonomy.`,
      })
      close()
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not start backfill",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setIsOpen(true)}>
        Reset and backfill
      </Button>
      <Modal.Root
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setIsOpen(true)
          else close()
        }}
      >
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Reset and backfill session intelligence"
            description={
              <Text.H5 color="foregroundMuted">
                This will rebuild session intelligence for{" "}
                <span className="font-medium text-foreground">{projectName}</span> from the latest 1,500 sessions.
              </Text.H5>
            }
          />
          <Modal.Body>
            <div className="flex flex-col gap-4">
              <Alert
                variant="destructive"
                description="Dangerous operation: this immediately deletes the existing taxonomy graph, taxonomy observations, semantic moments, moment labels, and session analyses for this project before starting the backfill workflows."
              />
              <Text.H5 color="foregroundMuted">
                Type <span className="font-medium text-foreground">{CONFIRMATION_PHRASE}</span> to confirm.
              </Text.H5>
              <Input
                type="text"
                label="Confirmation"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={CONFIRMATION_PHRASE}
              />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!isConfirmed || isSubmitting}
              onClick={() => void handleConfirm()}
            >
              {isSubmitting ? "Starting…" : "Reset and backfill"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
