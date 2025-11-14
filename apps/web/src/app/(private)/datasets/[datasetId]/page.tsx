import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import {
  DatasetRowsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { notFound, redirect } from 'next/navigation'
import Layout from '../_components/Layout'
import { DatasetDetailTable } from './DatasetDetailTable'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { DatasetRow } from '@latitude-data/core/schema/models/types/DatasetRow'
type GetDataResult = {
  redirectUrl?: string
  dataset: Dataset
  rows: DatasetRow[]
  count: number
}

const ROWS_PAGE_SIZE = '100'
async function getData({
  workspace,
  datasetId,
  isProcessing,
  page,
  pageSize,
  rowId,
}: {
  workspace: Workspace
  datasetId: string
  isProcessing: boolean
  page: string | undefined
  pageSize: string | undefined
  rowId: string | undefined
}): Promise<TypedResult<GetDataResult, Error>> {
  const scope = new DatasetsRepository(workspace.id)
  const result = await scope.find(Number(datasetId))
  if (result.error) return Result.error(result.error)

  const dataset = result.value

  const rowsRepo = new DatasetRowsRepository(workspace.id)

  if (rowId) {
    const { page: targetPage } = await rowsRepo.fetchDatasetRowWithPosition({
      datasetId: dataset.id,
      datasetRowId: Number(rowId),
      pageSize: Number(pageSize ?? ROWS_PAGE_SIZE),
    })

    if (targetPage && Number(page ?? 1) !== targetPage) {
      const route = ROUTES.datasets.detail(dataset.id)
      const query = new URLSearchParams()
      query.set('isProcessing', String(isProcessing))
      query.set('page', targetPage.toString())
      query.set('pageSize', pageSize ?? ROWS_PAGE_SIZE)
      query.set('rowId', rowId)

      return Result.ok({
        redirectUrl: `${route}?${query.toString()}`,
        dataset: dataset,
        rows: [],
        count: 0,
        isV2: true,
      })
    }
  }

  const size = pageSize ?? ROWS_PAGE_SIZE
  const count = await rowsRepo.getCountByDataset(dataset.id)
  const rows = await rowsRepo.findByDatasetPaginated({
    datasetId: dataset.id,
    page,
    pageSize: size,
  })

  return Result.ok({ dataset, rows, count, isV2: true })
}

export default async function DatasetDetail({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>
  searchParams: Promise<{
    isProcessing?: string
    pageSize: string
    page?: string
    rowId?: string
  }>
}) {
  const {
    pageSize,
    page: pageString,
    isProcessing: isProcessingString,
    rowId,
  } = await searchParams
  const isProcessing = isProcessingString === 'true'
  const { datasetId } = await params
  const { workspace } = await getCurrentUserOrRedirect()
  if (!workspace) return notFound()

  const result = await getData({
    workspace,
    datasetId,
    isProcessing,
    page: pageString,
    pageSize,
    rowId,
  })

  if (result.error) return notFound()
  if (result.value.redirectUrl) redirect(result.value.redirectUrl)

  return (
    <Layout size='full'>
      <DatasetDetailTable
        dataset={result.value.dataset}
        rows={result.value.rows}
        count={result.value.count}
        initialRenderIsProcessing={isProcessing}
      />
    </Layout>
  )
}
