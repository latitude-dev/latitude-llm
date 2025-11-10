import { ReactNode } from 'react'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ProjectSidebarLayout } from '@latitude-data/web-ui/sections/ProjectSidebarLayout'
import {
  getResizablePanelGroupData,
  MIN_SIDEBAR_WIDTH_PX,
  ResizableGroups,
} from '$/app/_lib/getResizablePanelGroupData'
import {
  findCommitCached,
  findProjectCached,
  getDocumentLogsApproximatedCountByProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { LIMITED_VIEW_THRESHOLD } from '@latitude-data/core/constants'
import { redirect } from 'next/navigation'

import { ActiveRunsCountProvider } from '../ActiveRunsCountProvider'
import { LastSeenCommitCookie } from '../LastSeenCommitCookie'
import Sidebar from '../Sidebar'

export default async function ProjectLayout({
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
  const session = await getCurrentUserOrRedirect()
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

  const approximatedCount =
    await getDocumentLogsApproximatedCountByProjectCached(project.id)
  const limitedView = approximatedCount > LIMITED_VIEW_THRESHOLD

  return (
    <ActiveRunsCountProvider limitedView={limitedView}>
      <ProjectSidebarLayout
        resizableId={resizableId}
        sidebarWidth={sidebarWidth}
        minSidebarWidth={MIN_SIDEBAR_WIDTH_PX}
        sidebar={
          <Sidebar project={project} commit={commit} currentDocument={document} />
        }
      >
        <LastSeenCommitCookie
          projectId={project.id}
          commitUuid={commitUuid}
          documentUuid={document?.documentUuid}
        />
        {children}
      </ProjectSidebarLayout>
    </ActiveRunsCountProvider>
  )
}
