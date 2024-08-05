import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import {
  getResizablePanelGroupData,
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
  const layoutData = getResizablePanelGroupData({ group: resizableId })
  return (
    <DocumentDetailWrapper
      resizableId={resizableId}
      resizableSizes={layoutData}
      sidebar={<Sidebar project={project} commit={commit} />}
    >
      <div className='p-32'>Main content. Remove Tailwind Styles from here</div>
    </DocumentDetailWrapper>
  )
}
