import { Button, Modal } from "@repo/ui"
import { useState } from "react"

/**
 * Confirms an organization-wide write in a modal before it lands. The deferred work is
 * kept as a thunk so each caller keeps its own values in its own closure, and a save
 * that moves no other project skips the modal entirely.
 */
export function useOrgDefaultConfirm(otherAffected: number) {
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  const run = async (apply: () => Promise<void>) => {
    setIsApplying(true)
    try {
      await apply()
      setPending(null)
    } finally {
      setIsApplying(false)
    }
  }

  return {
    isOpen: pending !== null,
    isApplying,
    request: async (apply: () => Promise<void>) => {
      if (otherAffected === 0) return run(apply)
      // Wrapped, or React would treat the thunk as a state updater.
      setPending(() => apply)
    },
    cancel: () => setPending(null),
    confirm: () => {
      if (pending) void run(pending)
    },
  }
}

export function OrgDefaultConfirmModal({
  projectCount,
  overrideCount,
  isApplying,
  onConfirm,
  onCancel,
}: {
  readonly projectCount: number
  readonly overrideCount: number
  readonly isApplying: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  const inheriting = projectCount - overrideCount

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => {
        if (!next && !isApplying) onCancel()
      }}
      title="Change the organization default?"
      description={`${inheriting} of ${projectCount} projects use this default and will change immediately.${
        overrideCount > 0 ? ` ${overrideCount} override it and keep their own values.` : ""
      }`}
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isApplying}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isApplying}>
            Save default
          </Button>
        </div>
      }
    />
  )
}
