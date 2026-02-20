'use server'

import { ReactNode } from 'react'
import { findProjectCached } from '$/app/(private)/_data-access'
import { ProjectProvider } from '$/app/providers/ProjectProvider'
import { CommitProvider } from '$/app/providers/CommitProvider'
import { DocumentVersionProvider } from '$/app/providers/DocumentProvider'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { findOrCreateMainDocumentCached } from '$/lib/dualScope/findOrCreateMainDocumentCached'
import { redirect } from 'next/navigation'
import ProjectLayout from '../versions/[commitUuid]/_components/ProjectLayout'

export default async function ProjectEvaluationsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string }>
}) {
  const awaitedParams = await params
  const projectId = Number(awaitedParams.projectId)
  const session = await getCurrentUserOrRedirect()
  if (!session.workspace || !session.user) return redirect(ROUTES.root)

  const project = await findProjectCached({
    projectId,
    workspaceId: session.workspace.id,
  })

  const { commit, document } = await findOrCreateMainDocumentCached({ project })

  return (
    <ProjectProvider project={project}>
      <CommitProvider project={project} commit={commit} isHead={false}>
        <DocumentVersionProvider
          document={document}
          projectId={project.id}
          commitUuid={commit.uuid}
        >
          <ProjectLayout
            projectId={project.id}
            commitUuid={commit.uuid}
            document={document}
          >
            {children}
          </ProjectLayout>
        </DocumentVersionProvider>
      </CommitProvider>
    </ProjectProvider>
  )
}
