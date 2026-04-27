import { Alert, Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminRevokeUserSessions } from "../../../../domains/admin/users.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface RevokeAllSessionsButtonProps {
  readonly userId: string
  readonly userEmail: string
}

/**
 * Sign a user out of every active session.
 *
 * Warning-level (not destructive): the action is reversible — the
 * user can sign in again at any time — and it's a routine support
 * remediation for "I think someone else got into my account". The
 * single-confirm shape mirrors Impersonate.
 *
 * On success we `router.invalidate()` so the loader re-runs. The
 * Sessions panel (when it lands in commit 6) will repaint empty;
 * for now the toast is the only visible feedback, which is fine
 * because the action is a fire-and-forget remediation.
 */
export function RevokeAllSessionsButton({ userId, userEmail }: RevokeAllSessionsButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const result = await adminRevokeUserSessions({ data: { userId } })
      const verb = result.sessionCount === 1 ? "session" : "sessions"
      toast({
        description:
          result.sessionCount === 0
            ? `${userEmail} had no active sessions to revoke.`
            : `Revoked ${result.sessionCount} active ${verb} for ${userEmail}.`,
      })
      void router.invalidate()
      setIsOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not revoke sessions",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={isSubmitting} onClick={() => setIsOpen(true)}>
        {isSubmitting ? "Revoking…" : "Revoke all sessions"}
      </Button>
      <Modal
        dismissible
        open={isOpen}
        size="large"
        onOpenChange={setIsOpen}
        title="Revoke all sessions"
        description={
          <Text.H5 color="foregroundMuted">
            Sign <span className="font-medium text-foreground">{userEmail}</span> out of every active session.
          </Text.H5>
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <CloseTrigger />
            <Button variant="default" size="sm" disabled={isSubmitting} onClick={() => void handleConfirm()}>
              {isSubmitting ? "Revoking…" : "Revoke sessions"}
            </Button>
          </div>
        }
      >
        <Alert
          variant="warning"
          description="This signs the user out everywhere — every browser, every device. They'll need to sign in again. The user's data and memberships are not affected."
        />
      </Modal>
    </>
  )
}
