import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { findOnboardingDocument } from '@latitude-data/core/services/documents/findOnboardingDocument'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '@latitude-data/core/lib/Result'
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
    throw new NotFoundError('Workspace ID is required')
  }

  const documentResult = await findOnboardingDocument(workspace.id)
  if (!Result.isOk(documentResult)) {
    throw new NotFoundError('No document found')
  }
  const { project, commit } = documentResult.unwrap()

  return { project, commit }
}
