import { Alert } from "@repo/ui"
import { useState } from "react"

/**
 * How many projects besides the one you're editing from would move if the default changed.
 * Overriders keep their own values, and a change to the project you're looking at is not
 * news, so neither counts. The Defaults page has no current project, so nothing is excluded.
 */
export const otherAffectedProjects = (input: {
  readonly projectCount: number
  readonly overrideCount: number
  readonly currentProjectInherits?: boolean
}): number => Math.max(0, input.projectCount - input.overrideCount - (input.currentProjectInherits ? 1 : 0))

/**
 * Two-step save for an organization default edited from inside a modal, where a
 * confirmation dialog would have to nest. Everywhere else uses
 * {@link useOrgDefaultConfirm} in `org-default-confirm-modal.tsx`.
 */
export function useInlineOrgDefaultConfirm(otherAffected: number) {
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  return {
    awaitingConfirm,
    /** False means stop and wait for a second, deliberate save. */
    gate: (): boolean => {
      if (otherAffected === 0 || awaitingConfirm) return true
      setAwaitingConfirm(true)
      return false
    },
    submitLabel: awaitingConfirm ? "Save anyway" : "Save default",
  }
}

export function OrgDefaultBlastRadius({
  projectCount,
  overrideCount,
  otherAffected,
  awaitingConfirm,
}: {
  readonly projectCount: number
  readonly overrideCount: number
  readonly otherAffected: number
  readonly awaitingConfirm: boolean
}) {
  if (awaitingConfirm) {
    return (
      <Alert
        variant="warning"
        showIcon
        title={`This changes ${otherAffected} other ${otherAffected === 1 ? "project" : "projects"}`}
        description="Save again to confirm. Projects that override this setting keep their own values."
      />
    )
  }

  return (
    <Alert
      variant="default"
      showIcon
      title={otherAffected > 0 ? "This affects other projects" : "This affects only this project"}
      description={
        overrideCount > 0
          ? `${projectCount - overrideCount} of ${projectCount} projects use this default. ${overrideCount} override it and won't change.`
          : `All ${projectCount} projects use this default.`
      }
    />
  )
}
