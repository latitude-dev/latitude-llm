import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  CommitsRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import buildMetatags from '$/app/_lib/buildMetatags'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'

import { DocumentTracesPage } from './_components/DocumentTracesPage'
import { SpanType, Span } from '@latitude-data/constants'
import { parseSpansFilters, SpansFilters } from '$/lib/schemas/filters'
import { buildCommitFilter } from '$/app/api/projects/[projectId]/commits/[commitUuid]/documents/[documentUuid]/spans/limited/route'

export const metadata = buildMetatags({
  locationDescription: 'Document Traces Page',
})

export default async function TracesPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  searchParams: Promise<{ filters?: string }>
}) {
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId, commitUuid, documentUuid } = await params
  const { filters: filtersParam } = await searchParams
  const validatedFilters = parseSpansFilters(filtersParam, 'traces page')
  const traceId = validatedFilters?.traceId

  // Check if traces feature is enabled
  const isTracesEnabled = await isFeatureEnabledByName(
    workspace.id,
    'traces',
  ).then((r) => r.unwrap())
  if (!isTracesEnabled) {
    const logsRoute = ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid })
      .documents.detail({ uuid: documentUuid }).logs.root
    redirect(logsRoute)
  }

  const commitsRepo = new CommitsRepository(workspace.id)
  const spansRepository = new SpansRepository(workspace.id)
  const spanFilterOptions: SpansFilters = {
    traceId: validatedFilters?.traceId,
    spanId: validatedFilters?.spanId,
    commitUuids: validatedFilters?.commitUuids,
    experimentUuids: validatedFilters?.experimentUuids,
    createdAt: validatedFilters?.createdAt,
  }
  const commit = await commitsRepo
    .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
    .then((r) => r.unwrap())
  const initialSpans: Span[] = traceId
    ? await spansRepository
        .list({ traceId })
        .then((r) => r.unwrap().filter((span) => span.type === SpanType.Prompt))
    : await spansRepository
        .findByDocumentAndCommitLimited({
          documentUuid,
          commitUuids: await buildCommitFilter({
            filters: spanFilterOptions,
            currentCommit: commit,
            commitsRepo,
          }),
          type: SpanType.Prompt,
        })
        .then((r) => r.unwrap().items)

  return (
    <DocumentTracesPage
      initialSpans={initialSpans}
      initialSpanFilterOptions={spanFilterOptions}
    />
  )
}
