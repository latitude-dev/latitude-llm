import {
  DATASET_COLUMN_ROLES,
  DatasetV2,
  DEFAULT_EVALUATION_LABEL_NAME,
} from '../../../browser'
import { DocumentLogWithMetadataAndError } from '../../../repositories'
import { Column } from '../../../schema'
import {
  buildColumns as buildColumnsFn,
  HashAlgorithmFn,
} from '../../datasetsV2/utils'

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
  dataset?: DatasetV2
  hashAlgorithm: HashAlgorithmFn
  logs: DocumentLogWithMetadataAndError[]
}) {
  let datasetColumns = dataset?.columns ?? []
  const logParameterNames = getUniqueParameterNamesFromLogs(logs)
  const fixedColumns = [
    { name: DEFAULT_EVALUATION_LABEL_NAME, role: DATASET_COLUMN_ROLES.label },
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
