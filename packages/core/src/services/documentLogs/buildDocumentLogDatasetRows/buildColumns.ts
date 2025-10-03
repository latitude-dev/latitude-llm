import {
  DATASET_COLUMN_ROLES,
  DEFAULT_DATASET_LABEL,
  DocumentLogWithMetadataAndError,
} from '../../../constants'
import { Column } from '../../../schema/models/datasets'
import { Dataset } from '../../../schema/types'
import {
  buildColumns as buildColumnsFn,
  HashAlgorithmFn,
} from '../../datasets/utils'

function getUniqueParameterNamesFromLogs(
  logs: DocumentLogWithMetadataAndError[],
) {
  const parameterNames = new Set<string>()
  for (const log of logs) {
    const paramaterKeys = log.parameters ? Object.keys(log.parameters) : []
    for (const paramaterKey of paramaterKeys) {
      parameterNames.add(paramaterKey)
    }
  }

  return Array.from(parameterNames).map((name) => ({ name }))
}

export type FixedColumnsByName = {
  label: Column
  documentLogId: Column
  tokens: Column
}

export function buildColumns({
  dataset,
  hashAlgorithm,
  logs,
}: {
  dataset?: Dataset
  hashAlgorithm: HashAlgorithmFn
  logs: DocumentLogWithMetadataAndError[]
}) {
  const datasetColumns = dataset?.columns ?? []
  const logParameterNames = getUniqueParameterNamesFromLogs(logs)
  const fixedColumns = [
    { name: DEFAULT_DATASET_LABEL, role: DATASET_COLUMN_ROLES.label },
    { name: 'document_log_id', role: DATASET_COLUMN_ROLES.metadata },
    { name: 'tokens', role: DATASET_COLUMN_ROLES.metadata },
  ]
  const allColumns = buildColumnsFn({
    hashAlgorithm,
    newColumns: [...logParameterNames, ...fixedColumns],
    prevColumns: datasetColumns,
  })

  const fixedColumnsByName = allColumns.reduce<FixedColumnsByName>(
    (acc, column) => {
      if (column.role === DATASET_COLUMN_ROLES.label) {
        acc.label = column
      } else if (column.name === 'document_log_id') {
        acc.documentLogId = column
      } else if (column.name === 'tokens') {
        acc.tokens = column
      }

      return acc
    },
    {} as FixedColumnsByName,
  )
  const parametersByName = allColumns.reduce<Record<string, Column>>(
    (acc, column) => {
      if (column.role === DATASET_COLUMN_ROLES.parameter) {
        acc[column.name] = column
      }

      return acc
    },
    {},
  )

  return { allColumns, parametersByName, fixedColumnsByName }
}
