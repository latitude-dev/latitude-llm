'use server'

import {
  getOnboardingResources,
  isOnboardingCompleted,
} from '$/data-access/workspaceOnboarding'
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
  const completed = await isOnboardingCompleted()
  if (completed) {
    redirect(ROUTES.dashboard.root)
  }

  const { project, commit, documents } = await getOnboardingResources()
  if (project === null || commit === null) {
    return redirect(ROUTES.auth.login)
  }
  const document = documents.find((d) => d.path === ONBOARDING_DOCUMENT_PATH)
  if (!document) {
    return redirect(ROUTES.auth.login)
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
