import { computeProjectStats } from '@latitude-data/core/services/projects/computeProjectStats'
import { TableWithHeader } from '@latitude-data/web-ui'
import {
  findProjectCached,
  getApiKeysCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import Overview from './_components/Overview'
import { TracesBlankSlate } from '../traces/_components/TracesBlankSlate'

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId } = await params
  const session = await getCurrentUser()
  const project = await findProjectCached({
    projectId: Number(projectId),
    workspaceId: session.workspace.id,
  })

  const apiKeys = await getApiKeysCached()
  const projectStats = await computeProjectStats({
    project,
  }).then((result) => result.unwrap())

  return projectStats.totalRuns > 0 ? (
    <div className='p-6'>
      <TableWithHeader
        title='Overview'
        table={<Overview project={project} stats={projectStats} />}
      />
    </div>
  ) : (
    <TracesBlankSlate apiKey={apiKeys[0]?.token} project={project} />
  )
}
