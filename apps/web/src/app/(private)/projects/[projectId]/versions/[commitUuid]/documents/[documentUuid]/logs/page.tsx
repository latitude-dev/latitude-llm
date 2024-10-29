import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeDocumentLogsWithMetadataQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { TableWithHeader } from '@latitude-data/web-ui'
import { findCommitCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { DocumentLogs } from './_components/DocumentLogs'

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  searchParams: QueryParams
}) {
  const { workspace } = await getCurrentUser()
  const projectId = Number(params.projectId)
  const commitUuid = params.commitUuid
  const commit = await findCommitCached({ projectId, uuid: commitUuid })
  const rows = await computeDocumentLogsWithMetadataQuery({
    workspaceId: workspace.id,
    documentUuid: params.documentUuid,
    draft: commit,
    page: searchParams.page as string | undefined,
    pageSize: searchParams.pageSize as string | undefined,
  })
  return (
    <div className='flex flex-col w-full h-full overflow-x-auto p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Logs'
        table={<DocumentLogs documentLogs={rows} />}
      />
    </div>
  )
}
