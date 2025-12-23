import {
  isFeatureEnabledCached,
  listOptimizationsByDocumentCached,
  positionOptimizationByDocumentCached,
} from '$/app/(private)/_data-access'
import buildMetatags from '$/app/_lib/buildMetatags'
import { parsePage, parsePageSize, parseUuid } from '$/lib/parseUtils'
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
  const optimizationUuid = parseUuid(queryParams.optimizationUuid)

  const isEnabled = await isFeatureEnabledCached('optimizations')
  if (!isEnabled) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid }).root,
    )
  }

  if (optimizationUuid) {
    const targetPage = await positionOptimizationByDocumentCached({
      optimizationUuid: optimizationUuid,
      documentUuid: documentUuid,
      pageSize: search.pageSize,
    })

    if (targetPage && search.page !== targetPage) {
      search.page = targetPage
      return redirect(
        ROUTES.projects
          .detail({ id: Number(projectId) })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: documentUuid })
          .optimizations.detail({ uuid: optimizationUuid, ...search }).root,
      )
    }
  }

  const optimizations = await listOptimizationsByDocumentCached({
    documentUuid: documentUuid,
    page: search.page,
    pageSize: search.pageSize,
  })

  const selectedOptimization = optimizations.find(
    (o) => o.uuid === optimizationUuid,
  )

  return (
    <ClientOptimizationsPage
      optimizations={optimizations}
      selectedOptimization={selectedOptimization}
      search={search}
    />
  )
}
