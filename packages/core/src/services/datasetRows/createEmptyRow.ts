import { DatasetV2, Workspace } from '../../browser'
import { database } from '../../client'
import { DatasetRowData } from '../../schema'
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
    dataset: DatasetV2
  },
  db = database,
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
    db,
  )
}
