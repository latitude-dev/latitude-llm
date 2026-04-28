import { Alert, Button, Checkbox, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminSetUserRole } from "../../../../domains/admin/users.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface PromoteDemoteStaffButtonProps {
  readonly userId: string
  readonly userEmail: string
  readonly currentRole: "user" | "admin"
}

/**
 * Toggle a user's platform-staff bit.
 *
 * Renders one button — "Promote to staff" or "Demote from staff" —
 * depending on `currentRole`, each with its own confirmation modal:
 *
 * - **Promote**: warning-level modal, single confirm. Granting access
 *   is reversible and high-frequency enough that we don't gate it on
 *   a checkbox.
 * - **Demote**: destructive modal with an "I understand" checkbox.
 *   Removing platform access is the dangerous-by-default direction:
 *   accidental clicks should be hard. The checkbox primes the actor
 *   that the next click is the one that mutates state.
 *
 * Self-demotion is intentionally allowed (decision in the plan). The
 * server function will mutate the actor's own row if asked; the next
 * request after the cookie cache flushes will reject them from the
 * backoffice like any other non-admin.
 *
 * On success we `router.invalidate()` so the loader re-runs and the
 * `<PlatformStaffBadge>` flips on the next render — no full page
 * reload needed (we're not swapping cookies the way impersonation
 * does).
 */
export function PromoteDemoteStaffButton({ userId, userEmail, currentRole }: PromoteDemoteStaffButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const isPromote = currentRole === "user"
  const targetRole: "user" | "admin" = isPromote ? "admin" : "user"
  const buttonLabel = isPromote ? "Promote to staff" : "Demote from staff"
  const submittingLabel = isPromote ? "Promoting…" : "Demoting…"

  const reset = () => {
    setIsOpen(false)
    setAcknowledged(false)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      await adminSetUserRole({ data: { userId, role: targetRole } })
      toast({
        description: isPromote ? `${userEmail} is now platform staff.` : `${userEmail} is no longer platform staff.`,
      })
      void router.invalidate()
      reset()
    } catch (error) {
      toast({
        variant: "destructive",
        title: isPromote ? "Could not promote user" : "Could not demote user",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDisabled = isSubmitting || (!isPromote && !acknowledged)

  return (
    <>
      <Button
        variant={isPromote ? "outline" : "destructive"}
        size="sm"
        disabled={isSubmitting}
        onClick={() => setIsOpen(true)}
      >
        {isSubmitting ? submittingLabel : buttonLabel}
      </Button>
      <Modal
        dismissible
        open={isOpen}
        size="large"
        onOpenChange={(next) => {
          if (!next) reset()
          else setIsOpen(true)
        }}
        title={isPromote ? "Promote to platform staff" : "Demote from platform staff"}
        description={
          <Text.H5 color="foregroundMuted">
            {isPromote ? "Grant" : "Revoke"} platform access for{" "}
            <span className="font-medium text-foreground">{userEmail}</span>.
          </Text.H5>
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <CloseTrigger />
            <Button
              variant={isPromote ? "default" : "destructive"}
              size="sm"
              disabled={confirmDisabled}
              onClick={() => void handleConfirm()}
            >
              {isSubmitting ? submittingLabel : isPromote ? "Promote" : "Demote"}
            </Button>
          </div>
        }
      >
        {isPromote ? (
          <Alert
            variant="warning"
            description="Platform staff can access the backoffice, view every organization, and impersonate any user. Only promote people on the Latitude team."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Alert
              variant="destructive"
              description="This user will lose access to the backoffice on their next request. Active sessions are not signed out — they just stop seeing /backoffice routes."
            />
            <label className="flex cursor-pointer items-start gap-2" htmlFor="demote-acknowledge">
              <Checkbox
                id="demote-acknowledge"
                checked={acknowledged}
                onCheckedChange={(state) => setAcknowledged(state === true)}
                disabled={isSubmitting}
              />
              <Text.H6 color="foregroundMuted">
                I understand this will revoke <span className="font-medium text-foreground">{userEmail}</span>'s
                platform-staff access.
              </Text.H6>
            </label>
          </div>
        )}
      </Modal>
    </>
  )
}
