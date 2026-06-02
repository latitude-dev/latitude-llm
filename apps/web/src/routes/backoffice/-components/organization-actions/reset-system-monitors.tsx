import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminResetSystemMonitors } from "../../../../domains/admin/organizations.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface ResetSystemMonitorsButtonProps {
  readonly organizationId: string
}

/**
 * Re-provision the three system monitors to their current definitions on every
 * project in the org. Lets staff push changes to the monitor titles /
 * descriptions / default alert condition values onto an org's existing system
 * monitors. Behind a confirmation modal because it overwrites those values
 * (including resetting the escalation sensitivity back to the default).
 */
export function ResetSystemMonitorsButton({ organizationId }: ResetSystemMonitorsButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const onConfirm = async () => {
    setIsPending(true)
    try {
      const result = await adminResetSystemMonitors({ data: { organizationId } })
      toast({
        description: `Reset ${result.monitorsReset} system monitor${result.monitorsReset === 1 ? "" : "s"} across ${result.projectsCount} project${result.projectsCount === 1 ? "" : "s"}.`,
      })
      setIsOpen(false)
      void router.invalidate()
    } catch (error) {
      toast({ variant: "destructive", title: "Could not reset system monitors", description: toUserMessage(error) })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Reset system monitors
      </Button>
      <Modal.Root open={isOpen} onOpenChange={setIsOpen}>
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Reset system monitors"
            description={
              <Text.H5 color="foregroundMuted">
                Re-provision the system monitors to their current definitions on every project in this org.
              </Text.H5>
            }
          />
          <Modal.Body>
            <Alert
              variant="warning"
              description="Re-applies the three system monitors (Issue discovered / Issue regressed / Issue escalating) to every project in this org. Overwrites their names, descriptions, and default alert condition values (e.g. resets the escalation sensitivity to the default). Mute state and incident history are preserved. A monitor slug already held by a user-created monitor is left untouched."
            />
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger>
              <Button variant="outline" size="sm">
                Close
              </Button>
            </CloseTrigger>
            <Button size="sm" onClick={() => void onConfirm()} disabled={isPending}>
              {isPending ? "Resetting…" : "Reset system monitors"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
