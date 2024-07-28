import { ReactNode } from 'react'

import { DocumentVersion } from '@latitude-data/core'
import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import { findCommit, findProject } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import Sidebar from '../Sidebar'

export default async function DocumentsLayout({
  children,
  document,
  commitUuid,
  projectId,
}: {
  children: ReactNode
  document?: DocumentVersion
  projectId: number
  commitUuid: string
}) {
  const session = await getCurrentUser()
  const project = await findProject({
    projectId,
    workspaceId: session.workspace.id,
  })
  const commit = await findCommit({
    project,
    uuid: commitUuid,
  })
  return (
    <DocumentDetailWrapper
      sidebar={<Sidebar commit={commit} currentDocument={document} />}
    >
      {children}
    </DocumentDetailWrapper>
  )
}
