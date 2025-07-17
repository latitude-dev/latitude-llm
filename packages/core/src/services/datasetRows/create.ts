import { Dataset, Workspace } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetRowData, datasetRows } from '../../schema'
export const createDatasetRow = async (
  {
    workspace,
    dataset,
    data,
  }: {
    workspace: Workspace
    dataset: Dataset
    data: {
      rowData: DatasetRowData
    }
  },
  db = database,
) => {
  return Transaction.call(async (trx) => {
    const inserts = await trx
      .insert(datasetRows)
      .values({
        workspaceId: workspace.id,
        datasetId: dataset.id,
        rowData: data.rowData,
      })
      .returning()

    const row = inserts[0]!

    return Result.ok(row)
  }, db)
}
