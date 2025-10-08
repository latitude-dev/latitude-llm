import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { findOnboardingDocument } from '@latitude-data/core/services/documents/findOnboardingDocument'
import { notFound } from 'next/navigation'
import { Result } from '@latitude-data/core/lib/Result'
import { calculateAllSteps } from '@latitude-data/core/services/workspaceOnboarding/steps/calculateAllSteps'
/**
 * Get the current workspace onboarding status
 * If the onboarding status doesn't exist, it creates a new one
 */
export async function getWorkspaceOnboardingStatus() {
  const { workspace } = await getCurrentUserOrRedirect()
  if (!workspace) {
    throw new Error('No workspace found')
  }

  const result = await getWorkspaceOnboarding({
    workspace,
  })

  // If onboarding record doesn't exist, return a mock onboarding status with completed set to true
  if (result.error) {
    return {
      id: 'mock',
      workspaceId: workspace,
      completedAt: new Date(),
    }
  }

  const onboarding = result.value
  return {
    id: onboarding.id,
    workspaceId: onboarding.workspaceId,
    completedAt: onboarding.completedAt,
  }
}

/**
 * Check if onboarding is completed
 */
export async function isOnboardingCompleted() {
  const onboarding = await getWorkspaceOnboardingStatus()
  return !!onboarding.completedAt
}

/**
 * Get the onboarding resources (project, commit, documents)
 */
export async function getOnboardingResources() {
  const { workspace } = await getCurrentUserOrRedirect()
  if (!workspace?.id) {
    return notFound()
  }

  // TODO(onboarding): Change this so instead of throwing an error if not found, return smth to redirect to pick an agent page
  const documentResult = await findOnboardingDocument(workspace.id)
  if (!Result.isOk(documentResult)) {
    return { project: null, commit: null }
  }
  const { project, commit } = documentResult.unwrap()

  return { project, commit }
}

export async function getNecessaryOnboardingSteps() {
  const { workspace } = await getCurrentUserOrRedirect()
  if (!workspace?.id) {
    return notFound()
  }
  const stepsResult = await calculateAllSteps({
    workspace,
  })
  if (!Result.isOk(stepsResult)) {
    return notFound()
  }
  return stepsResult.unwrap()
}
