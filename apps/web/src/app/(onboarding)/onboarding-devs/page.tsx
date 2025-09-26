import { redirect } from 'next/navigation'
import { isOnboardingCompleted } from '$/data-access/workspaceOnboarding'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { OnboardingClient } from './_components/OnboardingClient'
import { findOnboardingDocument } from '@latitude-data/core/services/documents/findOnboardingDocument'
import { findOnboardingDataset } from '@latitude-data/core/services/datasets/findOnboardingDataset'
import { ROUTES } from '$/services/routes'
import { PageNotFoundError } from 'next/dist/shared/lib/utils'

export default async function OnboardingRedirect() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }

  const { workspace } = await getCurrentUserOrRedirect()
  if (!workspace?.id) {
    throw new PageNotFoundError('Workspace ID is required')
  }

  const documentResult = await findOnboardingDocument(workspace.id)
  if (documentResult.error) {
    throw new PageNotFoundError('No document found')
  }
  const { documents, project, commit } = documentResult.value

  const datasetResult = await findOnboardingDataset(workspace.id)
  if (datasetResult.error) {
    throw datasetResult.error
  }
  const dataset = datasetResult.value

  return (
    <OnboardingClient
      workspaceName={workspace?.name}
      document={documents[0]} // TODO - change this later once we have a new onboarding
      project={project}
      commit={commit}
      dataset={dataset}
    />
  )
}
