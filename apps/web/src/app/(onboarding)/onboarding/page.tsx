import { isOnboardingCompleted } from '$/data-access/workspaceOnboarding'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { findOnboardingDataset } from '@latitude-data/core/services/datasets/findOnboardingDataset'
import { findOnboardingDocument } from '@latitude-data/core/services/documents/findOnboardingDocument'
import { redirect } from 'next/navigation'
import { OnboardingClient } from './_components/OnboardingClient'

export default async function OnboardingRedirect() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect('/dashboard')
  }

  const { workspace } = await getCurrentUserOrRedirect()
  if (!workspace?.id) {
    throw new NotFoundError('Workspace ID is required')
  }

  const documentResult = await findOnboardingDocument(workspace.id)
  if (documentResult.error) {
    throw documentResult.error
  }
  const { document, project, commit } = documentResult.value

  const datasetResult = await findOnboardingDataset(workspace.id)
  if (datasetResult.error) {
    throw datasetResult.error
  }
  const dataset = datasetResult.value

  return (
    <OnboardingClient
      workspaceName={workspace?.name}
      document={document}
      project={project}
      commit={commit}
      dataset={dataset}
    />
  )
}
