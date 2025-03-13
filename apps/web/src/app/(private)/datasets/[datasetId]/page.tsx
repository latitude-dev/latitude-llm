import { getCurrentUser } from '$/services/auth/getCurrentUser'
import {
  DatasetRowsRepository,
  DatasetsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { notFound } from 'next/navigation'
import { getFeatureFlagsForWorkspaceCached } from '$/components/Providers/FeatureFlags/getFeatureFlagsForWorkspace'
import { DatasetDetailTable, ROWS_PAGE_SIZE } from './DatasetDetailTable'
import {
  Dataset,
  DatasetV2,
  DatasetRow,
  Workspace,
} from '@latitude-data/core/browser'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import { DatasetV1DetailTable } from '$/app/(private)/datasets/_v1DeprecatedComponents/DatasetDetailTable'

type GetDataResult =
  | { isV2: false; dataset: Dataset }
  | { isV2: true; dataset: DatasetV2; rows: DatasetRow[] }

async function getData({
  workspace,
  datasetId,
  page,
  pageSize,
}: {
  workspace: Workspace
  datasetId: string
  page: string | undefined
  pageSize: string | undefined
}): Promise<TypedResult<GetDataResult, Error>> {
  const flags = getFeatureFlagsForWorkspaceCached({ workspace })
  const isV1 = !flags.datasetsV2.enabled

  if (isV1) {
    const scope = new DatasetsRepository(workspace.id)
    const result = await scope.find(datasetId)
    if (result.error) return Result.error(result.error)

    return Result.ok({ dataset: result.value, isV2: false })
  }

  const scope = new DatasetsV2Repository(workspace.id)
  const result = await scope.find(Number(datasetId))

  if (result.error) return Result.error(result.error)

  const dataset = result.value
  const rowsRepo = new DatasetRowsRepository(workspace.id)
  const rows = await rowsRepo.findByDatasetPaginated({
    datasetId: dataset.id,
    page,
    pageSize: pageSize ?? ROWS_PAGE_SIZE,
  })

  return Result.ok({ dataset, rows, isV2: true })
}

export default async function DatasetDetail({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>
  searchParams: Promise<{
    pageSize: string
    page?: string
  }>
}) {
  const { pageSize, page: pageString } = await searchParams
  const { datasetId } = await params
  const { workspace } = await getCurrentUser()
  const result = await getData({
    workspace,
    datasetId,
    page: pageString,
    pageSize,
  })

  if (result.error) return notFound()

  const isV1 = !result.value.isV2

  if (isV1) {
    return <DatasetV1DetailTable dataset={result.value.dataset} />
  }

  return (
    <DatasetDetailTable
      dataset={result.value.dataset}
      rows={result.value.rows}
    />
  )
}
