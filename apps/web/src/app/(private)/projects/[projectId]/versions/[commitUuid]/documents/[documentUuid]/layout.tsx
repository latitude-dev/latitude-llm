import { ReactNode } from 'react'

import {
  findCommitCached,
  findProjectCached,
  getDocumentByUuidCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import DocumentsLayout from '../../_components/DocumentsLayout'
import DocumentTabs from './_components/DocumentTabs'

export default async function DocumentPage({
  params,
  children,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  children: ReactNode
}) {
  const session = await getCurrentUser()
  const projectId = Number(params.projectId)
  const commintUuid = params.commitUuid
  const project = await findProjectCached({
    projectId,
    workspaceId: session.workspace.id,
  })
  const commit = await findCommitCached({ project, uuid: commintUuid })
  try {
    const document = await getDocumentByUuidCached({
      documentUuid: params.documentUuid,
      commit,
    })

    return (
      <DocumentsLayout
        projectId={projectId}
        commitUuid={commintUuid}
        document={document}
      >
        <DocumentTabs params={params}>{children}</DocumentTabs>
      </DocumentsLayout>
    )
  } catch (error) {
    // TODO: Show a 404 page within the documents layout, while still showing the sidebar and stuff
    // For now, we just redirect to documents root if document is not found instead for a cleaner UX
    return redirect(
      ROUTES.projects
        .detail({ id: Number(params.projectId) })
        .commits.detail({ uuid: params.commitUuid }).documents.root,
    )
  }
}
