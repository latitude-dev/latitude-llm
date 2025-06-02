import {
  findCommitCached,
  findCommitsByProjectCached,
  getDocumentByUuidCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import {
  DocumentLogFilterOptions,
  Workspace,
} from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeDocumentLogsWithMetadata } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import { redirect } from 'next/navigation'

import { DocumentLogsPage } from './_components'
import { DocumentLogBlankSlate } from './_components/DocumentLogs/DocumentLogBlankSlate'
import { parseLogFiltersParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseLogFilterParams'
import { findSomeDocumentLog } from '@latitude-data/core/services/documentLogs/data-access/findSomeDocumentLog'

async function fetchDocumentLogPage({
  workspace,
  filterOptions,
  documentLogUuid,
}: {
  workspace: Workspace
  filterOptions: DocumentLogFilterOptions
  documentLogUuid: string | undefined
}) {
  if (!documentLogUuid) return undefined

  const result = await fetchDocumentLogWithPosition({
    workspace,
    filterOptions,
    documentLogUuid,
  })

  if (result.error) return undefined

  return result.value.page.toString()
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  searchParams: Promise<QueryParams>
}) {
  const { workspace } = await getCurrentUser()
  const { projectId: pjid, commitUuid, documentUuid } = await params
  const projectId = Number(pjid)
  const document = await getDocumentByUuidCached({
    documentUuid: documentUuid,
    projectId,
    commitUuid,
  })

  const hasDocuments = await findSomeDocumentLog(document).then((r) => !!r)
  if (!hasDocuments) {
    const uploadUrl = ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).logs.upload

    return <DocumentLogBlankSlate uploadUrl={uploadUrl} />
  }

  const commit = await findCommitCached({ projectId, uuid: commitUuid })
  const commits = await findCommitsByProjectCached({ projectId })

  const { logUuid, pageSize, page: pageString, ...rest } = await searchParams
  const { filterOptions, redirectUrlParams, originalSelectedCommitsIds } =
    parseLogFiltersParams({
      params: rest,
      currentCommit: commit,
      commits,
    })

  const documentLogUuid = logUuid?.toString()
  const page = pageString?.toString?.()
  const currentLogPage = await fetchDocumentLogPage({
    workspace,
    filterOptions,
    documentLogUuid,
  })

  if (currentLogPage && currentLogPage !== page) {
    const route = ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: documentUuid }).logs.root

    const parameters = [
      `page=${currentLogPage}`,
      `logUuid=${documentLogUuid}`,
      ...redirectUrlParams,
    ].filter(Boolean)

    return redirect(`${route}?${parameters.join('&')}`)
  }

  const rows = await computeDocumentLogsWithMetadata({
    document,
    filterOptions,
    page,
    pageSize: pageSize as string | undefined,
  })

  const selectedLog = rows.find((r) => r.uuid === documentLogUuid)

  return (
    <DocumentLogsPage
      documentLogs={rows}
      selectedLog={selectedLog}
      originalSelectedCommitsIds={originalSelectedCommitsIds}
      documengLogFilterOptions={filterOptions}
    />
  )
}
