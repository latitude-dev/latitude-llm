import { Dataset, Workspace } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DatasetRowData, datasetRows } from '../../schema/models/datasetRows'
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
  transaction = new Transaction(),
) => {
  return transaction.call(async (trx) => {
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
  })
}
