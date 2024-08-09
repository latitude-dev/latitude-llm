import { ReactNode } from 'react'

import {
  findCommitCached,
  findProjectCached,
  getDocumentByUuidCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import DocumentsLayout from '../../_components/DocumentsLayout'

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
      {children}
    </DocumentsLayout>
  )
}
