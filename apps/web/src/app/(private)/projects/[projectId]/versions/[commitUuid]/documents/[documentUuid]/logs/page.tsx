import {
  buildPagination,
  parsePage,
} from '@latitude-data/core/lib/buildPagination'
import { computeDocumentLogsWithMetadata } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { TableBlankSlate, TableWithHeader } from '@latitude-data/web-ui'
import { findCommitCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { DocumentLogs } from './_components/DocumentLogs'

const PAGE_SIZE = 25
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const { workspace } = await getCurrentUser()
  const projectId = Number(params.projectId)
  const commitUuid = params.commitUuid
  const commit = await findCommitCached({ projectId, uuid: commitUuid })
  const page = parsePage(searchParams.page)
  const [rows, count] = await computeDocumentLogsWithMetadata({
    workspaceId: workspace.id,
    documentUuid: params.documentUuid,
    draft: commit,
    pagination: { page, pageSize: PAGE_SIZE },
  })
  const baseUrl = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: params.documentUuid }).logs.root
  const pagination = buildPagination({
    baseUrl,
    count,
    page,
    pageSize: PAGE_SIZE,
  })
  const title = `${pagination.count} logs (page ${pagination.currentPage} of ${pagination.totalPages})`
  return (
    <div className='flex flex-col w-full h-full overflow-hidden p-6 gap-2 min-w-0'>
      <TableWithHeader
        title={title}
        table={
          <>
            {!rows.length && (
              <TableBlankSlate description='There are no logs for this prompt yet. Logs will appear here when you run the prompt for the first time.' />
            )}
            {rows.length > 0 && (
              <DocumentLogs documentLogs={rows} pagination={pagination} />
            )}
          </>
        }
      />
    </div>
  )
}
