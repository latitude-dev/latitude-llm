import type { WorkspaceUsage } from '@latitude-data/core/browser'

export function calcualteUsage(workspaceUsage: WorkspaceUsage | undefined) {
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
  const ratio = (max - usage) / max
  const isOverlimitsMembers = members > maxMembers
  const isOverlimitsRuns = usage > max
  const isOverlimits = isOverlimitsRuns || isOverlimitsMembers

  return { ratio, max, isOverlimits, isOverlimitsRuns, isOverlimitsMembers }
}
