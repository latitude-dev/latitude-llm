import { SearchColumn, Operator } from '../types'

export const TIME_OPERATORS: Operator[] = [
  { label: 'is', value: 'eq' },
  { label: 'before', value: 'lt' },
  { label: 'after', value: 'gt' },
]

export const TEXT_OPERATORS: Operator[] = [
  { label: 'is', value: 'eq' },
  { label: 'is not', value: 'neq' },
  { label: 'is like', value: 'contains' },
  { label: 'is not like', value: 'not_contains' },
]

export const SEARCH_COLUMNS: SearchColumn[] = [
  { label: 'name', field: 'name', operators: TEXT_OPERATORS },
  { label: 'model', field: 'spans.model', operators: TEXT_OPERATORS },
  {
    label: 'distinct id',
    field: 'spans.distinctId',
    operators: TEXT_OPERATORS,
  },
  {
    label: 'version uuid',
    field: 'spans.commitUuid',
    operators: TEXT_OPERATORS,
  },
  {
    label: 'prompt uuid',
    field: 'spans.documentUuid',
    operators: TEXT_OPERATORS,
  },
  { label: 'trace id', field: 'traceId', operators: TEXT_OPERATORS },
]
