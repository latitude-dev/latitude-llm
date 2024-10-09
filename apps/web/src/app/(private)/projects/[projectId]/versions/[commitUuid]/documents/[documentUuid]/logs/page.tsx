import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { paginateQuery } from '@latitude-data/core/lib/pagination/paginate'
import { computeDocumentLogsWithMetadataQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { TableWithHeader } from '@latitude-data/web-ui'
import { findCommitCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { DocumentLogs } from './_components/DocumentLogs'

function pageUrl(params: {
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  return ROUTES.projects
    .detail({ id: Number(params.projectId) })
    .commits.detail({ uuid: params.commitUuid })
    .documents.detail({ uuid: params.documentUuid }).logs.root
}

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
  const { rows, pagination } = await paginateQuery({
    searchParams,
    pageUrl: { base: pageUrl(params) },
    dynamicQuery: computeDocumentLogsWithMetadataQuery({
      workspaceId: workspace.id,
      documentUuid: params.documentUuid,
      draft: commit,
    }).$dynamic(),
  })
  return (
    <div className='flex flex-col w-full h-full overflow-x-auto p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Logs'
        table={<DocumentLogs documentLogs={rows} pagination={pagination} />}
      />
    </div>
  )
}
