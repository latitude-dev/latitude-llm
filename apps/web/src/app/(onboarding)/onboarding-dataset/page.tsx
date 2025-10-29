'use server'

import { PageTrackingWrapper } from '$/components/PageTrackingWrapper'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { OnboardingClient } from './_components/OnboardingClient'
//import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
//import { Result } from '@latitude-data/core/lib/Result'
import buildMetatags from '$/app/_lib/buildMetatags'
import { getOnboardingResources } from '$/data-access/workspaceOnboarding'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { ProjectProvider } from '$/app/providers/ProjectProvider'
import { CommitProvider } from '$/app/providers/CommitProvider'
import { ONBOARDING_DOCUMENT_PATH } from '@latitude-data/core/constants'
import { DocumentValueProvider } from '$/hooks/useDocumentValueContext'
import { DevModeProvider } from '$/hooks/useDevMode'
import { MetadataProvider } from '$/components/MetadataProvider'
import { DocumentVersionProvider } from '$/app/providers/DocumentProvider'

export async function generateMetadata() {
  // TODO(onboarding): change this to prompt engineering onboarding title once we activate the onboarding
  return buildMetatags({
    title: 'Dataset Onboarding',
  })
}

export default async function OnboardingDatasetPage() {
  const { user, workspace } = await getCurrentUserOrRedirect()
  const { project, commit, documents } = await getOnboardingResources()
  if (project === null || commit === null) {
    return redirect(ROUTES.auth.login)
  }
  const document = documents.find((d) => d.path === ONBOARDING_DOCUMENT_PATH)
  if (!document) {
    return redirect(ROUTES.auth.login)
  }

  // TODO(onboarding): remove this once we activate the onboarding
  // TODO(onboarding): remove this once we merge this PR
  //   const isDatasetOnboardingEnabledResult = await isFeatureEnabledByName(
  //     workspace.id,
  //     'dataset-onboarding',
  //   )

  //   if (!Result.isOk(isDatasetOnboardingEnabledResult)) {
  //     return redirect(ROUTES.dashboard.root)
  //   }
  //   const isDatasetOnboardingEnabled = isDatasetOnboardingEnabledResult.unwrap()

  //   if (!isDatasetOnboardingEnabled) {
  //     return redirect(ROUTES.dashboard.root)
  //   }

  return (
    <PageTrackingWrapper
      namePageVisited='datasetOnboarding'
      additionalData={{ workspaceId: workspace.id, userEmail: user.email }}
    >
      <MetadataProvider>
        <ProjectProvider project={project}>
          <CommitProvider project={project} commit={commit} isHead={false}>
            <DevModeProvider>
              <DocumentValueProvider document={document} documents={documents}>
                <DocumentVersionProvider
                  projectId={project.id}
                  commitUuid={commit.uuid}
                  document={document}
                >
                  <OnboardingClient user={user} />
                </DocumentVersionProvider>
              </DocumentValueProvider>
            </DevModeProvider>
          </CommitProvider>
        </ProjectProvider>
      </MetadataProvider>
    </PageTrackingWrapper>
  )
}
