import { ReactNode } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
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
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import Sidebar from '../Sidebar'

export default async function DocumentsLayout({
  children,
  commitUuid,
  projectId,
  document,
}: {
  children: ReactNode
  projectId: number
  commitUuid: string
  document?: DocumentVersion
}) {
  const session = await getCurrentUser()
  let project
  try {
    project = await findProjectCached({
      projectId,
      workspaceId: session.workspace.id,
    })
  } catch (error) {
    console.warn((error as Error).message)

    if (error instanceof NotFoundError) {
      return redirect(ROUTES.dashboard.root)
    }

    throw error
  }

  const commit = await findCommitCached({
    projectId,
    uuid: commitUuid,
  })
  const resizableId = ResizableGroups.DocumentSidebar
  const sidebarWidth =
    (await getResizablePanelGroupData({ group: resizableId })) ??
    MIN_SIDEBAR_WIDTH_PX

  return (
    <DocumentDetailWrapper
      resizableId={resizableId}
      sidebarWidth={sidebarWidth}
      minSidebarWidth={MIN_SIDEBAR_WIDTH_PX}
      sidebar={
        <Sidebar currentDocument={document} project={project} commit={commit} />
      }
    >
      {children}
    </DocumentDetailWrapper>
  )
}
