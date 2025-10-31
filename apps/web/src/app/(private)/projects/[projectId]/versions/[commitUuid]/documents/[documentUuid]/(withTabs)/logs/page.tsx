import {
  findCommitCached,
  findCommitsByProjectCached,
  getDocumentByUuidCached,
  getDocumentLogsApproximatedCountCached,
  getDocumentStatsCached,
  hasDocumentLogsCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import {
  computeDocumentLogLimitedCursor,
  computeDocumentLogsLimited,
  computeDocumentLogsWithMetadata,
} from '@latitude-data/core/services/documentLogs/computeDocumentLogsWithMetadata'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import { redirect } from 'next/navigation'

import { parseLogFiltersParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseLogFilterParams'
import { DocumentLogsPage } from './_components'
import { DocumentLogBlankSlate } from './_components/DocumentLogs/DocumentLogBlankSlate'
import buildMetatags from '$/app/_lib/buildMetatags'
import { Cursor } from '@latitude-data/core/schema/types'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  DocumentLogFilterOptions,
  LIMITED_VIEW_THRESHOLD,
} from '@latitude-data/core/constants'

export const metadata = buildMetatags({
  locationDescription: 'Document Logs Page',
})

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
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId: pjid, commitUuid, documentUuid } = await params
  const projectId = Number(pjid)
  const document = await getDocumentByUuidCached({
    documentUuid: documentUuid,
    projectId,
    commitUuid,
  })

  const hasLogs = await hasDocumentLogsCached(documentUuid)
  if (!hasLogs) {
    const uploadUrl = ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).logs.upload

    return <DocumentLogBlankSlate uploadUrl={uploadUrl} />
  }

  const commit = await findCommitCached({ projectId, uuid: commitUuid })
  const commits = await findCommitsByProjectCached({ projectId })

  const {
    logUuid,
    pageSize,
    page: pageString,
    from: fromString,
    ...rest
  } = await searchParams
  const { filterOptions, redirectUrlParams, originalSelectedCommitsIds } =
    parseLogFiltersParams({ params: rest, currentCommit: commit, commits })

  const approximatedCount =
    await getDocumentLogsApproximatedCountCached(documentUuid)
  if (approximatedCount > LIMITED_VIEW_THRESHOLD) {
    return DocumentLogsLimitedPage({
      workspace,
      projectId: projectId,
      commit: commit,
      document: document,
      approximatedCount: approximatedCount,
      from: fromString ? JSON.parse(fromString.toString()) : null,
      selectedLogUuid: logUuid?.toString(),
      filters: filterOptions,
      redirectUrlParams: redirectUrlParams,
      originalSelectedCommitsIds: originalSelectedCommitsIds,
    })
  }

  const documentLogUuid = logUuid?.toString()
  const page = pageString?.toString()
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
      documentLogFilterOptions={filterOptions}
    />
  )
}

async function DocumentLogsLimitedPage({
  workspace,
  projectId,
  commit,
  document,
  approximatedCount,
  from,
  selectedLogUuid,
  filters,
  redirectUrlParams,
  originalSelectedCommitsIds,
}: {
  workspace: Workspace
  projectId: number
  commit: Commit
  document: DocumentVersion
  approximatedCount: number
  from: Cursor<string, number> | null
  selectedLogUuid: string | undefined
  filters: DocumentLogFilterOptions
  redirectUrlParams: (string | undefined)[]
  originalSelectedCommitsIds: number[]
}) {
  if (selectedLogUuid) {
    const route = ROUTES.projects
      .detail({ id: projectId })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).logs.root

    const cursor = await computeDocumentLogLimitedCursor({
      workspace: workspace,
      logUuid: selectedLogUuid,
      filters: filters,
    })
    if (!cursor) return redirect(route)

    if (from?.value !== cursor.value || from?.id !== cursor.id + 1) {
      const target = { value: cursor.value, id: cursor.id + 1 }

      const params = new URLSearchParams()
      params.set('from', JSON.stringify(target))
      params.set('logUuid', selectedLogUuid)
      const filters = redirectUrlParams.filter(Boolean)

      return redirect(`${route}?${params.toString()}&${filters.join('&')}`)
    }
  }

  const result = await computeDocumentLogsLimited({
    document: document,
    from: from,
    filters: filters,
  })

  const selectedLog = result.items.find((r) => r.uuid === selectedLogUuid)

  let limitedView = await getDocumentStatsCached(document.documentUuid)
  if (!limitedView) {
    limitedView = {
      totalCount: approximatedCount,
      totalTokens: 0,
      totalCostInMillicents: 0,
      averageTokens: 0,
      averageCostInMillicents: 0,
      averageDuration: 0,
      medianCostInMillicents: 0,
      medianDuration: 0,
      dailyCount: [],
    }
  }

  return (
    <DocumentLogsPage
      documentLogs={result.items}
      selectedLog={selectedLog}
      limitedView={limitedView}
      originalSelectedCommitsIds={originalSelectedCommitsIds}
      documentLogFilterOptions={filters}
    />
  )
}
