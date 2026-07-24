import { Alert, Button, Modal, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminSetOrganizationShowcase } from "../../../../domains/admin/organizations.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface EnableShowcaseButtonProps {
  readonly organizationId: string
  /** Current `wantsShowcase` state — drives the enable vs disable affordance. */
  readonly wantsShowcase: boolean
}

/**
 * Toggle the org's `wantsShowcase` flag — the staff counterpart to the
 * user-facing "Remove demo" dismiss. Enabling re-surfaces the shared read-only
 * Showcase for an org that dismissed it (or one created before the feature);
 * the demo entry only actually appears once a showcase has been built. Behind a
 * confirmation modal because the flag is org-wide — it flips for the whole team.
 */
export function EnableShowcaseButton({ organizationId, wantsShowcase }: EnableShowcaseButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const next = !wantsShowcase
  const verb = next ? "Enable" : "Disable"

  const onConfirm = async () => {
    setIsPending(true)
    try {
      await adminSetOrganizationShowcase({ data: { organizationId, enabled: next } })
      toast({ description: `Showcase ${next ? "enabled" : "disabled"} for this organization.` })
      setIsOpen(false)
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: `Could not ${verb.toLowerCase()} showcase`,
        description: toUserMessage(error),
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <Button variant={next ? "outline" : "destructive-outline"} size="sm" onClick={() => setIsOpen(true)}>
        {verb} showcase
      </Button>
      <Modal
        open={isOpen}
        dismissible
        onOpenChange={(open) => (!open ? setIsOpen(false) : undefined)}
        title={`${verb} showcase`}
        description={
          next
            ? "Opt this organization into the shared read-only Showcase demo project."
            : "Remove the shared read-only Showcase demo project from this organization."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => setIsOpen(false)}>
              Close
            </Button>
            <Button
              variant={next ? "default" : "destructive"}
              size="sm"
              disabled={isPending}
              isLoading={isPending}
              onClick={() => void onConfirm()}
            >
              {verb} showcase
            </Button>
          </div>
        }
      >
        <Alert
          variant={next ? "default" : "warning"}
          description={
            next
              ? "Sets wantsShowcase = true for the whole org. The 'Latitude Demo' entry then appears in every member's project switcher, but only once a showcase has been built. Use this to re-enable the demo for an org that dismissed it, or to opt in an org created before the feature existed."
              : "Sets wantsShowcase = false for the whole org. The demo entry disappears from every member's switcher and /projects/lat-demo 404s. Same effect as a member using 'Remove demo'."
          }
        />
      </Modal>
    </>
  )
}
