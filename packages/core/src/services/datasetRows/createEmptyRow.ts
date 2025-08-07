import type { Dataset, Workspace } from '../../browser'
import Transaction from '../../lib/Transaction'
import type { DatasetRowData } from '../../schema'
import { createDatasetRow } from './create'

/**
 * From datasets row UI when user clicks on "Add Row" button
 * we create a new row in the dataset with all columns empty
 */
export const createDatasetEmptyRow = async (
  {
    workspace,
    dataset,
  }: {
    workspace: Workspace
    dataset: Dataset
  },
  transaction = new Transaction(),
) => {
  const rowData = dataset.columns.reduce((acc, column) => {
    acc[column.identifier] = ''
    return acc
  }, {} as DatasetRowData)

  return createDatasetRow(
    {
      workspace,
      dataset,
      data: { rowData },
    },
    transaction,
  )
}
