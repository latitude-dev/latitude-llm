import { Metadata } from 'next'
import buildMetatags from '$/app/_lib/buildMetatags'
import { DocumentTracesPage } from './_components/DocumentTracesPage'
import { parseSpansFilters, SpansFilters } from '$/lib/schemas/filters'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { isClickHouseSpansReadEnabled } from '@latitude-data/core/services/workspaceFeatures/isClickHouseSpansReadEnabled'

export const metadata: Promise<Metadata> = buildMetatags({
  locationDescription: 'Document Traces Page',
})

export default async function TracesPage({
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  searchParams: Promise<{ filters?: string }>
}) {
  const { filters: filtersParam } = await searchParams
  const { workspace } = await getCurrentUserOrRedirect()
  const canReadSpansFromClickHouse = await isClickHouseSpansReadEnabled(
    workspace.id,
  )
  const validatedFilters = parseSpansFilters(filtersParam, 'traces page')
  const initialSpanFilterOptions: SpansFilters = {
    documentLogUuid: validatedFilters?.documentLogUuid,
    spanId: validatedFilters?.spanId,
    commitUuids: validatedFilters?.commitUuids,
    experimentUuids: validatedFilters?.experimentUuids,
    testDeploymentIds: validatedFilters?.testDeploymentIds,
    createdAt: validatedFilters?.createdAt,
  }

  return (
    <DocumentTracesPage
      initialSpanFilterOptions={initialSpanFilterOptions}
      canReadSpansFromClickHouse={canReadSpansFromClickHouse}
    />
  )
}
