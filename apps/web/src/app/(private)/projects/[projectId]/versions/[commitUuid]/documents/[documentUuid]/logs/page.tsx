import { Workspace } from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeDocumentLogsWithMetadataQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import { Button, TableWithHeader } from '@latitude-data/web-ui'
import { findCommitCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { DocumentLogs } from './_components/DocumentLogs'

async function fetchDocumentLogPage({
  workspace,
  documentLogUuid,
}: {
  workspace: Workspace
  documentLogUuid: string | undefined
}) {
  if (!documentLogUuid) return undefined

  const result = await fetchDocumentLogWithPosition({
    workspace,
    documentLogUuid,
  })

  if (result.error) return undefined

  return result.value.page.toString()
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
  const documentUuid = params.documentUuid
  const commit = await findCommitCached({ projectId, uuid: commitUuid })
  const documentLogUuid = searchParams.logUuid?.toString()
  const page = searchParams.page?.toString?.()
  const currentLogPage = await fetchDocumentLogPage({
    workspace,
    documentLogUuid,
  })

  if (currentLogPage && currentLogPage !== page) {
    const route = ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: documentUuid }).logs.root
    return redirect(
      `${route}?page=${currentLogPage}&logUuid=${documentLogUuid}`,
    )
  }

  // Paginated logs
  const rows = await computeDocumentLogsWithMetadataQuery({
    workspaceId: workspace.id,
    documentUuid,
    draft: commit,
    page,
    pageSize: searchParams.pageSize as string | undefined,
  })

  // Current log in that page
  const selectedLog = rows.find((r) => r.uuid === documentLogUuid)

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Logs'
        table={<DocumentLogs documentLogs={rows} selectedLog={selectedLog} />}
        actions={
          <Link
            href={
              ROUTES.projects
                .detail({ id: projectId })
                .commits.detail({ uuid: params.commitUuid })
                .documents.detail({ uuid: params.documentUuid }).logs.upload
            }
          >
            <Button fancy variant='outline'>
              Upload logs
            </Button>
          </Link>
        }
      />
    </div>
  )
}
