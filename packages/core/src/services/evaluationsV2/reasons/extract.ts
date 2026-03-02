import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DatasetRow } from '../../../schema/models/types/DatasetRow'
import { getColumnData } from '../../datasets/utils'

export async function extractCustomReason({
  dataset,
  row,
  column,
}: {
  dataset: Dataset
  row: DatasetRow
  column: string
}) {
  if (!dataset.columns.find((c) => c.name === column)) {
    return Result.error(
      new BadRequestError(`Column '${column}' not found in dataset`),
    )
  }

  const customReason = getColumnData({ dataset, row, column })

  return Result.ok(customReason)
}
