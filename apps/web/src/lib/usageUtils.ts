import { type WorkspaceUsage } from '@latitude-data/core/constants'

export function calculateUsage(workspaceUsage: WorkspaceUsage | undefined) {
  if (!workspaceUsage) {
    return {
      ratio: 1,
      max: 0,
      isOverlimits: false,
      isOverlimitsRuns: false,
      isOverlimitsMembers: false,
    }
  }

  const { usage, max, members, maxMembers } = workspaceUsage

  const ratio = max === 'unlimited' ? 0.1 : (max - usage) / max
  const isOverlimitsMembers =
    maxMembers === 'unlimited' ? false : members > maxMembers
  const isOverlimitsRuns = max === 'unlimited' ? false : usage > max
  const isOverlimits = isOverlimitsRuns || isOverlimitsMembers

  return { ratio, max, isOverlimits, isOverlimitsRuns, isOverlimitsMembers }
}
