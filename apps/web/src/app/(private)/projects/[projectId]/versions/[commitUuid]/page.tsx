import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import { findCommit, findProject } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import Sidebar from './_components/Sidebar'

export const dynamic = 'force-dynamic'

export default async function CommitRoot({
  params,
}: {
  params: { projectId: string; commitUuid: string }
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
  return (
    <DocumentDetailWrapper>
      <Sidebar commit={commit} />
      <div className='p-32'>Main content. Remove Tailwind Styles from here</div>
    </DocumentDetailWrapper>
  )
}
