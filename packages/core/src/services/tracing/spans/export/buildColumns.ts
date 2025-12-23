import {
  DATASET_COLUMN_ROLES,
  DEFAULT_DATASET_LABEL,
  Span,
  SpanMetadata,
  SpanType,
} from '../../../../constants'
import { Column } from '../../../../schema/models/datasets'
import { type Dataset } from '../../../../schema/models/types/Dataset'
import {
  buildColumns as buildColumnsFn,
  HashAlgorithmFn,
} from '../../../datasets/utils'

function getUniqueParameterNamesFromSpans(
  spans: Span<SpanType.Prompt>[],
  metadatas: Map<string, SpanMetadata<SpanType.Prompt>>,
) {
  const parameterNames = new Set<string>()
  for (const span of spans) {
    const key = `${span.traceId}:${span.id}`
    const metadata = metadatas.get(key)
    const parameterKeys = metadata?.parameters
      ? Object.keys(metadata.parameters)
      : []
    for (const parameterKey of parameterKeys) {
      parameterNames.add(parameterKey)
    }
  }

  return Array.from(parameterNames).map((name) => ({ name }))
}

export type FixedColumnsByName = {
  label: Column
  spanId: Column
  traceId: Column
  tokens: Column
}

export function buildColumns({
  dataset,
  hashAlgorithm,
  spans,
  metadatas,
}: {
  dataset?: Dataset
  hashAlgorithm: HashAlgorithmFn
  spans: Span<SpanType.Prompt>[]
  metadatas: Map<string, SpanMetadata<SpanType.Prompt>>
}) {
  const datasetColumns = dataset?.columns ?? []
  const spanParameterNames = getUniqueParameterNamesFromSpans(spans, metadatas)
  const fixedColumns = [
    { name: DEFAULT_DATASET_LABEL, role: DATASET_COLUMN_ROLES.label },
    { name: 'span_id', role: DATASET_COLUMN_ROLES.metadata },
    { name: 'trace_id', role: DATASET_COLUMN_ROLES.metadata },
    { name: 'tokens', role: DATASET_COLUMN_ROLES.metadata },
  ]
  const allColumns = buildColumnsFn({
    hashAlgorithm,
    newColumns: [...spanParameterNames, ...fixedColumns],
    prevColumns: datasetColumns,
  })

  const fixedColumnsByName = allColumns.reduce<FixedColumnsByName>(
    (acc, column) => {
      if (column.role === DATASET_COLUMN_ROLES.label) {
        acc.label = column
      } else if (column.name === 'span_id') {
        acc.spanId = column
      } else if (column.name === 'trace_id') {
        acc.traceId = column
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
