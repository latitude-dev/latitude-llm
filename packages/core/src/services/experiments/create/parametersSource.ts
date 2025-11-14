import {
  ExperimentDatasetSource,
  ExperimentLogsSource,
  ExperimentManualSource,
  ExperimentParametersSource,
} from '@latitude-data/constants'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { Dataset } from '../../../schema/models/types/Dataset'
import { Workspace } from '../../../schema/models/types/Workspace'
import { DatasetRowsRepository } from '../../../repositories'
import { Result } from '../../../lib/Result'
import { BadRequestError } from '@latitude-data/constants/errors'

export type ParametersPopulation =
  | (Omit<ExperimentDatasetSource, 'datasetId'> & { dataset: Dataset })
  | ExperimentLogsSource
  | ExperimentManualSource

export async function getParametersSource(
  {
    parametersPopulation,
    workspace,
  }: {
    parametersPopulation: ParametersPopulation
    workspace: Workspace
  },
  transaction = new Transaction(),
): PromisedResult<{
  count: number
  parametersSource: ExperimentParametersSource
}> {
  if (parametersPopulation.source === 'manual') {
    return Result.ok({
      count: parametersPopulation.count,
      parametersSource: parametersPopulation,
    })
  }

  if (parametersPopulation.source === 'logs') {
    return Result.ok({
      count: parametersPopulation.count,
      parametersSource: parametersPopulation,
    })
  }

  if (parametersPopulation.source === 'dataset') {
    // Dataset source - need to resolve datasetId from dataset and handle row count
    const {
      dataset,
      fromRow: fromRowIndex,
      toRow: toRowIndex,
      datasetLabels,
      parametersMap,
    } = parametersPopulation

    return transaction.call(async (tx) => {
      const datasetRowsScope = new DatasetRowsRepository(workspace.id, tx)
      const totalRowCount = await datasetRowsScope.getCountByDataset(dataset.id)

      const toRow = toRowIndex
        ? Math.min(toRowIndex, totalRowCount)
        : totalRowCount

      const fromRow = Math.max(1, fromRowIndex)

      const count = toRow - fromRow + 1

      return Result.ok({
        parametersSource: {
          source: 'dataset' as const,
          datasetId: dataset.id,
          fromRow,
          toRow,
          datasetLabels,
          parametersMap,
        },
        count,
      })
    })
  }

  return Result.error(
    new BadRequestError('Invalid parameters source for Experiment'),
  )
}
