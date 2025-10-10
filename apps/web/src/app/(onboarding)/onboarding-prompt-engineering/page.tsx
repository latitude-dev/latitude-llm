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
import { ProjectProvider } from '$/app/providers/ProjectProvider'
import { CommitProvider } from '$/app/providers/CommitProvider'
import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'

export default async function OnboardingRedirect() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }

  const { documents, project, commit } = await getOnboardingResources()
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
    <PageTrackingWrapper namePageVisited='promptEngineeringOnboarding'>
      <ProjectProvider project={project}>
        <CommitProvider project={project} commit={commit} isHead={false}>
          <OnboardingClient document={document} dataset={dataset} />
        </CommitProvider>
      </ProjectProvider>
    </PageTrackingWrapper>
  )
}
