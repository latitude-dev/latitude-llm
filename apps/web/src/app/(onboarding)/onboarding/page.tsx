import { redirect } from 'next/navigation'
import { isOnboardingCompleted } from '$/data-access/workspaceOnboarding'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { OnboardingClient } from './_components/OnboardingClient'
import { findOnboardingDocument } from '@latitude-data/core/services/documents/findOnboardingDocument'
import { findOnboardingDataset } from '@latitude-data/core/services/datasets/findOnboardingDataset'
import { ROUTES } from '$/services/routes'

export default async function OnboardingRedirect() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect('/dashboard')
  }

  const { workspace } = await getCurrentUser()
  if (!workspace?.id) return redirect(ROUTES.auth.login)

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
