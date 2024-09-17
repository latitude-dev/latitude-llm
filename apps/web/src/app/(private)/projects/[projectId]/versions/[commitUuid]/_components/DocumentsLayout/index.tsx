import { ReactNode } from 'react'

import type { DocumentVersion } from '@latitude-data/core/browser'
import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import {
  getResizablePanelGroupData,
  MIN_SIDEBAR_WIDTH_PX,
  ResizableGroups,
} from '$/app/_lib/getResizablePanelGroupData'
import {
  findCommitCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
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
  const project = await findProjectCached({
    projectId,
    workspaceId: session.workspace.id,
  })
  const commit = await findCommitCached({
    projectId,
    uuid: commitUuid,
  })
  const resizableId = ResizableGroups.DocumentSidebar
  const sidebarWidth =
    getResizablePanelGroupData({ group: resizableId }) ?? MIN_SIDEBAR_WIDTH_PX

  return (
    <DocumentDetailWrapper
      resizableId={resizableId}
      sidebarWidth={sidebarWidth}
      minSidebarWidth={MIN_SIDEBAR_WIDTH_PX}
      sidebar={
        <Sidebar project={project} commit={commit} currentDocument={document} />
      }
    >
      {children}
    </DocumentDetailWrapper>
  )
}
