import { ColumnFilters } from '.'
import {
  DATASET_COLUMN_ROLES,
  Dataset,
  DEFAULT_DATASET_LABEL,
} from '../../../browser'
import { DocumentLogWithMetadataAndError } from '../../../repositories'
import { Column } from '../../../schema'
import {
  buildColumns as buildColumnsFn,
  ColumnArgs,
  HashAlgorithmFn,
} from '../../datasets/utils'

const DEFAULT_STATIC_COLUMNS = ['output', 'id', 'duration', 'tokens']

function getUniqueParameterNamesFromLogs(
  logs: DocumentLogWithMetadataAndError[],
): string[] {
  const parameterNames = new Set<string>()
  for (const log of logs) {
    const paramaterKeys = log.parameters ? Object.keys(log.parameters) : []
    for (const paramaterKey of paramaterKeys) {
      parameterNames.add(paramaterKey)
    }
  }

  return Array.from(parameterNames)
}

function buildParameterColumnsArgs(
  logs: DocumentLogWithMetadataAndError[],
  parameterColumnNames?: string[],
): ColumnArgs[] {
  const parameterNames =
    parameterColumnNames ?? getUniqueParameterNamesFromLogs(logs)
  return parameterNames.map((name) => ({
    name,
    role: DATASET_COLUMN_ROLES.parameter,
  }))
}

function buildStaticColumnsArgs(staticColumnNames?: string[]) {
  const staticNames = staticColumnNames ?? DEFAULT_STATIC_COLUMNS
  return staticNames.map((name) => ({
    name,
    role:
      name === DEFAULT_DATASET_LABEL
        ? DATASET_COLUMN_ROLES.label
        : DATASET_COLUMN_ROLES.metadata,
  }))
}

export function buildColumns({
  dataset,
  hashAlgorithm,
  logs,
  columnFilters,
}: {
  dataset?: Dataset
  hashAlgorithm: HashAlgorithmFn
  logs: DocumentLogWithMetadataAndError[]
  columnFilters?: ColumnFilters
}): Column[] {
  let datasetColumns = dataset?.columns ?? []
  const parameterColumnArgs = buildParameterColumnsArgs(
    logs,
    columnFilters?.parameterColumnNames,
  )
  const staticColumnArgs = buildStaticColumnsArgs(
    columnFilters?.staticColumnNames,
  )
  return buildColumnsFn({
    hashAlgorithm,
    newColumns: [...parameterColumnArgs, ...staticColumnArgs],
    prevColumns: datasetColumns,
  })
}
