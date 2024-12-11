import {
  DocumentLogFilterOptions,
  Workspace,
} from '@latitude-data/core/browser'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { computeDocumentLogsWithMetadataQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import {
  findCommitCached,
  findCommitsByProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { DocumentLogsPage } from './_components'
import { DocumentLogsRepository } from '@latitude-data/core/repositories'
import { DocumentLogBlankSlate } from './_components/DocumentLogs/DocumentLogBlankSlate'
import { parseLogFiltersParams } from '@latitude-data/core/services/documentLogs/index'

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

  const documentLogsRepo = new DocumentLogsRepository(workspace.id)
  if (!documentLogsRepo.hasLogs(documentUuid)) {
    return <DocumentLogBlankSlate />
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
      .documents.detail({ uuid: documentUuid }).logs

    const parameters = [
      `page=${currentLogPage}`,
      `logUuid=${documentLogUuid}`,
      ...redirectUrlParams,
    ].filter(Boolean)

    return redirect(`${route}?${parameters.join('&')}`)
  }

  const rows = await computeDocumentLogsWithMetadataQuery({
    workspaceId: workspace.id,
    documentUuid,
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
