import { getCurrentUser } from '$/services/auth/getCurrentUser'
import {
  DatasetRowsRepository,
  DatasetsV2Repository,
} from '@latitude-data/core/repositories'
import { notFound } from 'next/navigation'
import { DatasetDetailTable } from './DatasetDetailTable'

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
  const scope = new DatasetsV2Repository(workspace.id)
  const result = await scope.find(Number(datasetId))

  if (result.error) return notFound()

  const dataset = result.value
  const rowsRepo = new DatasetRowsRepository(workspace.id)
  const rows = await rowsRepo.findByDatasetPaginated({
    datasetId: dataset.id,
    page: pageString?.toString?.(),
    pageSize: pageSize as string | undefined,
  })
  return <DatasetDetailTable dataset={dataset} rows={rows} />
}
