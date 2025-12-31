'use server'

import { getOnboardingResources } from '$/data-access/onboarding'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { ProjectProvider } from '$/app/providers/ProjectProvider'
import { CommitProvider } from '$/app/providers/CommitProvider'
import { ONBOARDING_DOCUMENT_PATH } from '@latitude-data/core/constants'
import { DocumentValueProvider } from '$/hooks/useDocumentValueContext'
import { DevModeProvider } from '$/hooks/useDevMode'
import { MetadataProvider } from '$/components/MetadataProvider'
import { DocumentVersionProvider } from '$/app/providers/DocumentProvider'
import { ReactNode } from 'react'

export default async function OnboardingDatasetLayout({
  children,
}: {
  children: ReactNode
}) {
  const { project, commit, documents } = await getOnboardingResources()
  if (project === null || commit === null) {
    return redirect(ROUTES.onboarding.choice)
  }
  const document = documents.find((d) => d.path === ONBOARDING_DOCUMENT_PATH)
  if (!document) {
    return redirect(ROUTES.onboarding.choice)
  }

  return (
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
                {children}
              </DocumentVersionProvider>
            </DocumentValueProvider>
          </DevModeProvider>
        </CommitProvider>
      </ProjectProvider>
    </MetadataProvider>
  )
}
