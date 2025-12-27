import {
  isFeatureEnabledCached,
  listOptimizationsByDocumentCached,
} from '$/app/(private)/_data-access'
import buildMetatags from '$/app/_lib/buildMetatags'
import { parsePage, parsePageSize } from '$/lib/parseUtils'
import { ROUTES } from '$/services/routes'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { OptimizationsPage as ClientOptimizationsPage } from './_components/OptimizationsPage'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetatags({
    locationDescription: 'Prompt Optimizations List',
  })
}

export default async function OptimizationsPage({
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
  const { projectId, commitUuid, documentUuid } = await params
  const queryParams = await searchParams
  const search = {
    page: parsePage(queryParams.page),
    pageSize: parsePageSize(queryParams.pageSize),
  }

  const isEnabled = await isFeatureEnabledCached('optimizations')
  if (!isEnabled) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid }).root,
    )
  }

  const optimizations = await listOptimizationsByDocumentCached({
    documentUuid: documentUuid,
  })

  return (
    <ClientOptimizationsPage optimizations={optimizations} search={search} />
  )
}
