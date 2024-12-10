import {
  DocumentLogFilterOptions,
  LogSources,
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

  const {
    logUuid,
    pageSize,
    page: pageString,
    versions: _selectedCommitsIds,
    origins: _selectedLogSources,
  } = await searchParams

  const originalSelectedCommitsIds = [
    ...commits.filter((c) => !!c.mergedAt).map((c) => c.id),
    ...(!commit.mergedAt ? [commit.id] : []),
  ]

  const selectedCommitsIds = (
    Array.isArray(_selectedCommitsIds)
      ? _selectedCommitsIds
      : (_selectedCommitsIds?.split(',') ?? originalSelectedCommitsIds)
  ).map(Number)

  const selectedSources = (
    Array.isArray(_selectedLogSources)
      ? _selectedLogSources
      : (_selectedLogSources?.split(',') ?? Object.values(LogSources))
  ).filter((s) =>
    Object.values(LogSources).includes(s as LogSources),
  ) as LogSources[]

  const logsFilterOptions: DocumentLogFilterOptions = {
    commitIds: selectedCommitsIds,
    logSources: selectedSources,
  }

  const documentLogUuid = logUuid?.toString()
  const page = pageString?.toString?.()
  const currentLogPage = await fetchDocumentLogPage({
    workspace,
    filterOptions: logsFilterOptions,
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
      _selectedCommitsIds ? `versions=${_selectedCommitsIds}` : undefined,
      _selectedLogSources ? `origins=${_selectedLogSources}` : undefined,
    ].filter(Boolean)

    return redirect(`${route}?${parameters.join('&')}`)
  }

  const rows = await computeDocumentLogsWithMetadataQuery({
    workspaceId: workspace.id,
    documentUuid,
    filterOptions: logsFilterOptions,
    page,
    pageSize: pageSize as string | undefined,
  })

  const selectedLog = rows.find((r) => r.uuid === documentLogUuid)

  return (
    <DocumentLogsPage
      documentLogs={rows}
      selectedLog={selectedLog}
      originalSelectedCommitsIds={originalSelectedCommitsIds}
      documengLogFilterOptions={logsFilterOptions}
    />
  )
}
