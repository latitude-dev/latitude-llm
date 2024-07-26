import React from 'react'

import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import {
  findCommit,
  findProject,
  getDocumentByUuid,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import Sidebar from '../../_components/Sidebar'

export default async function DocumentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const session = await getCurrentUser()
  const project = await findProject({
    projectId: Number(params.projectId),
    workspaceId: session.workspace.id,
  })
  const commit = await findCommit({
    project,
    uuid: params.commitUuid,
  })
  const document = await getDocumentByUuid({
    documentUuid: params.documentUuid,
    commit,
  })
  return (
    <DocumentDetailWrapper>
      <Sidebar
        commit={commit}
        documentUuid={params.documentUuid}
        documentPath={document.path}
      />
      {children}
    </DocumentDetailWrapper>
  )
}
