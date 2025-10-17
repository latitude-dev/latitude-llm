import { type Dataset } from '../../schema/models/types/Dataset'
import { DatasetColumnRole } from '../../constants'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { updateDataset } from './update'

export async function updateDatasetColumn(
  {
    dataset,
    data,
  }: {
    dataset: Dataset
    data: {
      identifier: string
      name: string
      role: DatasetColumnRole
    }
  },
  transaction = new Transaction(),
): Promise<TypedResult<Dataset, Error>> {
  const column = dataset.columns.find((c) => c.identifier === data.identifier)

  if (!column) {
    return Result.error(new Error('Column not found'))
  }

  const columns = dataset.columns.map((c) => {
    if (c.identifier !== data.identifier) return c

    return { ...c, name: data.name, role: data.role }
  })

  const updatedDatasetResult = await updateDataset(
    { dataset, data: { columns } },
    transaction,
  )
  if (updatedDatasetResult.error) return updatedDatasetResult

  return Result.ok(updatedDatasetResult.value as Dataset)
}
