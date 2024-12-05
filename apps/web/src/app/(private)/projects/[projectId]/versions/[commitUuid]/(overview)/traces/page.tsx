import { listTraces } from '@latitude-data/core/services/traces/list'
import { TableWithHeader } from '@latitude-data/web-ui'
import {
  findCommitCached,
  findProjectCached,
  getApiKeysCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { TracesTable } from './_components/TracesTable'
import { TracesBlankSlate } from './_components/TracesBlankSlate'

export default async function TracesPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
  }>
  searchParams: Promise<{
    page: string
    pageSize: string
  }>
}) {
  const user = await getCurrentUser()
  const { projectId, commitUuid } = await params
  const { page, pageSize } = await searchParams
  const commit = await findCommitCached({
    projectId: Number(projectId),
    uuid: commitUuid,
  })
  const project = await findProjectCached({
    projectId: Number(projectId),
    workspaceId: user.workspace.id,
  })
  const apiKeys = await getApiKeysCached()
  const traces = await listTraces({
    project,
    page: Number(page ?? '1'),
    pageSize: Number(pageSize ?? '25'),
  }).then((r) => r.unwrap())

  if (!traces?.items.length) {
    return <TracesBlankSlate apiKey={apiKeys[0]?.token} project={project} />
  }

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Traces'
        table={
          <TracesTable
            traces={traces}
            projectId={Number(projectId)}
            commit={commit}
            workspace={user.workspace}
          />
        }
      />
    </div>
  )
}
