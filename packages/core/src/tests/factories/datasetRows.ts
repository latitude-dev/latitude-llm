import { faker } from '@faker-js/faker'
import { Dataset, Workspace } from '../../browser'
import { Column, DatasetRowData } from '../../schema'
import { createDatasetRow as createDatasetRowFn } from '../../services/datasetRows/create'

export type InputData = {
  workspace: Workspace
  dataset: Dataset
  columns?: Column[]
  rowData?: DatasetRowData
}

export async function createDatasetRow(data: InputData) {
  const columns = data.columns ?? []
  let rowData = data.rowData
  if (!rowData && columns.length > 0) {
    rowData = columns.reduce((acc, column) => {
      acc[column.identifier] = faker.word.noun()
      return acc
    }, {} as DatasetRowData)
  } else if (!rowData) {
    throw new Error('Either columns or rowData must be provided')
  }

  const result = await createDatasetRowFn({
    workspace: data.workspace,
    dataset: data.dataset,
    data: { rowData },
  })

  const dataset = result.unwrap()
  return dataset
}
