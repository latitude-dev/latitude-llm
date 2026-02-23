import { Metadata } from 'next'
import buildMetatags from '$/app/_lib/buildMetatags'
import { parseSpansFilters, SpansFilters } from '$/lib/schemas/filters'
import { ProjectTracesPage } from './_components/ProjectTracesPage'

export const metadata: Promise<Metadata> = buildMetatags({
  locationDescription: 'Project Traces Page',
})

export default async function TracesPage({
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
  }>
  searchParams: Promise<{ filters?: string }>
}) {
  const { filters: filtersParam } = await searchParams
  const validatedFilters = parseSpansFilters(
    filtersParam,
    'project traces page',
  )

  const initialSpanFilterOptions: SpansFilters = {
    documentLogUuid: validatedFilters?.documentLogUuid,
    spanId: validatedFilters?.spanId,
    createdAt: validatedFilters?.createdAt,
  }

  return (
    <ProjectTracesPage initialSpanFilterOptions={initialSpanFilterOptions} />
  )
}
