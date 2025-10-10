'use server'

import { notFound, redirect } from 'next/navigation'
import {
  getOnboardingDataset,
  getOnboardingResources,
  isOnboardingCompleted,
} from '$/data-access/workspaceOnboarding'
import { OnboardingClient } from './_components/OnboardingClient'
import { ROUTES } from '$/services/routes'
import { ONBOARDING_DOCUMENT_PATH } from '@latitude-data/core/constants'

export default async function OnboardingRedirect() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }

  const { workspace, documents, project, commit } =
    await getOnboardingResources()
  if (project === null || commit === null) {
    return notFound()
  }

  const document = documents.find((d) => d.path === ONBOARDING_DOCUMENT_PATH)
  if (!document) {
    return notFound()
  }

  const dataset = await getOnboardingDataset()
  if (!dataset) {
    return notFound()
  }

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
