import { Metadata } from 'next'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  CommitsRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import buildMetatags from '$/app/_lib/buildMetatags'
import { DocumentTracesPage } from './_components/DocumentTracesPage'
import { SpanType, Span } from '@latitude-data/constants'
import { parseSpansFilters, SpansFilters } from '$/lib/schemas/filters'
import { buildCommitFilter } from '$/app/api/spans/limited/route'
import { compact } from 'lodash-es'
import { getDefaultSpansCreatedAtRange } from '@latitude-data/core/services/spans/defaultCreatedAtWindow'

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
  const documentLogUuid = validatedFilters?.documentLogUuid

  const commitsRepo = new CommitsRepository(workspace.id)
  const spansRepository = new SpansRepository(workspace.id)
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
  const initialSpanResult = documentLogUuid
    ? compact([
        await spansRepository.findLastMainSpanByDocumentLogUuid(
          documentLogUuid,
        ),
      ])
    : await (async () => {
        const commitUuids = await buildCommitFilter({
          filters: baseSpanFilterOptions,
          currentCommit: commit,
          commitsRepo,
        })

        const firstPage = await spansRepository
          .findByDocumentAndCommitLimited({
            documentUuid,
            commitUuids,
            types: [SpanType.Prompt, SpanType.External],
            createdAt: requestedCreatedAt,
          })
          .then((r) => r.unwrap())

        return {
          items: firstPage.items,
          didFallbackToAllTime: Boolean(firstPage.didFallbackToAllTime),
        }
      })()

  const initialSpans: Span[] = Array.isArray(initialSpanResult)
    ? initialSpanResult
    : initialSpanResult.items

  const initialSpanFilterOptions: SpansFilters = {
    ...baseSpanFilterOptions,
    createdAt:
      requestedCreatedAt ??
      (Array.isArray(initialSpanResult) ||
      initialSpanResult.didFallbackToAllTime
        ? undefined
        : defaultCreatedAt),
  }

  return (
    <DocumentTracesPage
      initialSpans={initialSpans}
      initialSpanFilterOptions={initialSpanFilterOptions}
    />
  )
}
