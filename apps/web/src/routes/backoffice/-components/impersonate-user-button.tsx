import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useState } from "react"
import { impersonateUser } from "../../../domains/admin/impersonation.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"

interface ImpersonateUserButtonProps {
  readonly userId: string
  readonly userEmail: string
}

/**
 * Opens a confirmation modal before starting impersonation. The copy is
 * intentionally reused verbatim from v1 (`latitude-v1` branch):
 *
 * > This will allow you to access the application as them. Use ONLY
 * > for support purposes after acknowledgement from the user.
 *
 * On confirm, calls the `impersonateUser` server function, then
 * forces a full-page navigation to `/`. The hard reload is deliberate:
 * Better Auth caches the session user for 5 minutes
 * (`session.cookieCache`), so an SPA navigation after swap could
 * briefly render the admin's identity against the target's cookie.
 */
export function ImpersonateUserButton({ userId, userEmail }: ImpersonateUserButtonProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleImpersonate = async () => {
    setIsSubmitting(true)
    try {
      await impersonateUser({ data: { userId } })
      // Full reload bypasses Better Auth's cookie cache (5 min TTL) and
      // the route tree's cached loader data, so the target's dashboard
      // renders against the freshly-swapped session cookie.
      window.location.href = "/"
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not start impersonation",
        description: toUserMessage(error),
      })
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" disabled={isSubmitting} onClick={() => setIsOpen(true)}>
        {isSubmitting ? "Impersonating…" : "Impersonate User"}
      </Button>
      <Modal
        dismissible
        open={isOpen}
        size="large"
        onOpenChange={setIsOpen}
        title="Impersonate User"
        description={
          <Text.H5 color="foregroundMuted">
            Impersonate <span className="font-medium text-foreground">{userEmail}</span> and access the application as
            them.
          </Text.H5>
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <CloseTrigger />
            <Button variant="destructive" size="sm" disabled={isSubmitting} onClick={() => void handleImpersonate()}>
              {isSubmitting ? "Impersonating…" : "Impersonate"}
            </Button>
          </div>
        }
      >
        <Alert
          variant="warning"
          description="This will allow you to access the application as them. Use ONLY for support purposes after acknowledgement from the user."
        />
      </Modal>
    </>
  )
}
