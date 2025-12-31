import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { getOrCreateOnboardingDocument } from '@latitude-data/core/services/documents/getOrCreateOnboardingDocument'
import { notFound } from 'next/navigation'
import { Result } from '@latitude-data/core/lib/Result'
import { findOnboardingDataset } from '@latitude-data/core/services/datasets/findOnboardingDataset'

/**
 * Check if onboarding is completed for the current user
 */
export async function isOnboardingCompleted() {
  const { user } = await getCurrentUserOrRedirect()
  return !!user.onboardingCompletedAt
}

/**
 * Get the onboarding resources (project, workspace, commit, documents)
 * Creates missing resources if they don't exist
 */
export async function getOnboardingResources() {
  const { workspace, user } = await getCurrentUserOrRedirect()
  if (!workspace?.id) {
    return notFound()
  }

  const documentResult = await getOrCreateOnboardingDocument({
    workspace,
    user,
  })
  if (!Result.isOk(documentResult)) {
    return { workspace, documents: [], project: null, commit: null }
  }
  const { documents, project, commit } = documentResult.unwrap()

  return { workspace, documents, project, commit }
}

/**
 * Get the onboarding dataset (if it exists)
 */
export async function getOnboardingDataset() {
  const { workspace } = await getCurrentUserOrRedirect()
  if (!workspace?.id) {
    return notFound()
  }
  const datasetResult = await findOnboardingDataset(workspace.id)
  if (!Result.isOk(datasetResult)) {
    return notFound()
  }
  return datasetResult.unwrap()
}

