import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { DatasetRowsRepository, DatasetsV2Repository } from '@latitude-data/core/repositories'
import { notFound } from 'next/navigation'

export default async function GenerateDatasetPage({
  params,
}: {
  params: Promise<{ datasetId: string }>
}) {
  const { datasetId } = await params
  const { workspace } = await getCurrentUser()
  const scope = new DatasetsV2Repository(workspace.id)
  const result = await scope.find(Number(datasetId))
  if (result.error) return notFound()

  const dataset = result.value
  const rowsRepo = new DatasetRowsRepository(workspace.id)
  const rows = await rowsRepo.findByDataset(dataset.id)
  return (
    <div>
      <h1>{dataset.name}</h1>
      <p>{JSON.stringify(dataset.columns, null, 2)}</p>
      <p>{JSON.stringify(rows, null, 2)}</p>
    </div>
  )
}
