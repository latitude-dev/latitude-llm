import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeDocumentLogsWithMetadataQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { Button, TableWithHeader, Text } from '@latitude-data/web-ui'
import {
  findCommitCached,
  getDocumentByUuidCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { DocumentBlankSlateLayout } from '../../_components/DocumentBlankSlateLayout'
import { DocumentsClient } from '../../_components/DocumentsClient'
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
  const documentLogUuid = searchParams.logUuid?.toString()
  const selectedLog = rows.find((r) => r.uuid === documentLogUuid)
  const document = await getDocumentByUuidCached({
    documentUuid: params.documentUuid,
    projectId,
    commitUuid,
  })

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      {!rows.length && (
        <DocumentBlankSlateLayout>
          <div className='flex flex-col gap-4 items-center'>
            <Text.H5>
              To get started, please choose one of the following options:
            </Text.H5>
          </div>
          <Link
            href={
              ROUTES.projects
                .detail({ id: projectId })
                .commits.detail({ uuid: params.commitUuid })
                .documents.detail({ uuid: params.documentUuid }).logs.upload
            }
          >
            <Button fullWidth variant='outline'>
              <div className='flex flex-col gap-1 p-4'>
                <Text.H4M>Import logs from UI</Text.H4M>
                <Text.H5 color='foregroundMuted'>
                  If you run prompts outside of Latitude, you can upload your
                  logs in order to evaluate them.
                </Text.H5>
              </div>
            </Button>
          </Link>
          <Text.H5 color='foregroundMuted'>Or</Text.H5>
          <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
            <Text.H4M>Import logs from code</Text.H4M>
            <Text.H5 color='foregroundMuted'>
              Run this code snippet to start importing logs into Latitude. Once
              done, come back to this page, and you'll be able to evaluate both
              existing and incoming logs.
            </Text.H5>
            <DocumentsClient document={document} />
          </div>
        </DocumentBlankSlateLayout>
      )}
      {rows.length && (
        <TableWithHeader
          title='Logs'
          table={
            <DocumentLogs
              documentLogs={rows}
              documentLogUuid={documentLogUuid}
              selectedLog={selectedLog}
            />
          }
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
      )}
    </div>
  )
}
