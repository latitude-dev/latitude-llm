import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { TableWithHeader } from '@latitude-data/web-ui'
import { findCommitCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { TracesTable } from './_components/TracesTable'

export default async function TracesPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
  }>
}) {
  const user = await getCurrentUser()
  const { projectId, commitUuid } = await params
  const commit = await findCommitCached({
    projectId: Number(projectId),
    uuid: commitUuid,
  })

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Traces'
        table={
          <TracesTable
            projectId={Number(projectId)}
            commit={commit}
            workspace={user.workspace}
          />
        }
      />
    </div>
  )
}
