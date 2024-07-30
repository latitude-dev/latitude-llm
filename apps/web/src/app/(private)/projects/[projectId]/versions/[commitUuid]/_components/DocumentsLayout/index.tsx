import { ReactNode } from 'react'

import type { DocumentVersion } from '@latitude-data/core/browser'
import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import {
  getResizablePanelGroupData,
  ResizableGroups,
} from '$/app/_lib/getResizablePanelGroupData'
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
  const resizableId = ResizableGroups.DocumentSidebar
  const layoutData = getResizablePanelGroupData({ group: resizableId })
  return (
    <DocumentDetailWrapper
      resizableId={resizableId}
      resizableSizes={layoutData}
      sidebar={
        <Sidebar project={project} commit={commit} currentDocument={document} />
      }
    >
      {children}
    </DocumentDetailWrapper>
  )
}
