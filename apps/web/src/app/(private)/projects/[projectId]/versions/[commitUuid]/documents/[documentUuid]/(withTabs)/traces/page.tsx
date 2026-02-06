import { Metadata } from 'next'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { CommitsRepository } from '@latitude-data/core/repositories'
import buildMetatags from '$/app/_lib/buildMetatags'
import { DocumentTracesPage } from './_components/DocumentTracesPage'
import { parseSpansFilters, SpansFilters } from '$/lib/schemas/filters'
import { getDefaultSpansCreatedAtRange } from '@latitude-data/core/services/spans/defaultCreatedAtWindow'
import { getConversationsForDocument } from '$/app/api/conversations/route'

export const metadata: Promise<Metadata> = buildMetatags({
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

  const commitsRepo = new CommitsRepository(workspace.id)
  const requestedCreatedAt =
    validatedFilters?.createdAt?.from || validatedFilters?.createdAt?.to
      ? validatedFilters.createdAt
      : undefined
  const defaultCreatedAt = getDefaultSpansCreatedAtRange()

  const baseSpanFilterOptions: SpansFilters = {
    documentLogUuid: validatedFilters?.documentLogUuid,
    spanId: validatedFilters?.spanId,
    commitUuids: validatedFilters?.commitUuids,
    experimentUuids: validatedFilters?.experimentUuids,
    testDeploymentIds: validatedFilters?.testDeploymentIds,
    createdAt: requestedCreatedAt,
  }
  const commit = await commitsRepo
    .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
    .then((r) => r.unwrap())

  const conversationsResponse = await getConversationsForDocument({
    workspace,
    documentUuid,
    commit,
    commitsRepo,
    filters: baseSpanFilterOptions,
  })

  const initialSpanFilterOptions: SpansFilters = {
    ...baseSpanFilterOptions,
    createdAt:
      requestedCreatedAt ??
      (conversationsResponse.didFallbackToAllTime
        ? undefined
        : defaultCreatedAt),
  }

  return (
    <DocumentTracesPage
      initialConversations={conversationsResponse}
      initialSpanFilterOptions={initialSpanFilterOptions}
    />
  )
}
