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
  const spanFilterOptions: SpansFilters = {
    documentLogUuid: validatedFilters?.documentLogUuid,
    spanId: validatedFilters?.spanId,
    commitUuids: validatedFilters?.commitUuids,
    experimentUuids: validatedFilters?.experimentUuids,
    testDeploymentIds: validatedFilters?.testDeploymentIds,
    createdAt: validatedFilters?.createdAt,
  }
  const commit = await commitsRepo
    .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
    .then((r) => r.unwrap())
  const initialSpans: Span[] = documentLogUuid
    ? await spansRepository.listByDocumentLogUuid(documentLogUuid)
    : await spansRepository
        .findByDocumentAndCommitLimited({
          documentUuid,
          commitUuids: await buildCommitFilter({
            filters: spanFilterOptions,
            currentCommit: commit,
            commitsRepo,
          }),
          types: [SpanType.Prompt, SpanType.External],
        })
        .then((r) => r.unwrap().items)

  return (
    <DocumentTracesPage
      initialSpans={initialSpans}
      initialSpanFilterOptions={spanFilterOptions}
    />
  )
}
