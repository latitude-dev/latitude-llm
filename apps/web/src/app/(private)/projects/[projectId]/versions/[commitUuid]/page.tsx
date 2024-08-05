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

import Sidebar from './_components/Sidebar'

export const dynamic = 'force-dynamic'

export default async function CommitRoot({
  params,
}: {
  params: { projectId: string; commitUuid: string }
}) {
  const session = await getCurrentUser()
  const project = await findProjectCached({
    projectId: Number(params.projectId),
    workspaceId: session.workspace.id,
  })
  const commit = await findCommitCached({
    project,
    uuid: params.commitUuid,
  })
  const resizableId = ResizableGroups.DocumentSidebar
  const sidebarWidth =
    getResizablePanelGroupData({ group: resizableId }) ?? MIN_SIDEBAR_WIDTH_PX
  return (
    <DocumentDetailWrapper
      resizableId={resizableId}
      sidebarWidth={sidebarWidth}
      minSidebarWidth={MIN_SIDEBAR_WIDTH_PX}
      sidebar={<Sidebar project={project} commit={commit} />}
    >
      <div className='p-32'>Main content. Remove Tailwind Styles from here</div>
    </DocumentDetailWrapper>
  )
}
