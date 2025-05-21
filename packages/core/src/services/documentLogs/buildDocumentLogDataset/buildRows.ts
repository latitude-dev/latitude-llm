import { DocumentLogWithMetadataAndError } from '../../../repositories/runErrors/documentLogsRepository'
import { Column, DatasetRowData } from '../../../schema'
import { ProviderOutput } from './findProviderOutputs'

function flattenJSON(obj: any, res: any = {}, prefix: string = '') {
  for (const key in obj) {
    if (typeof obj[key] !== 'object') {
      res[prefix + key] = obj[key]
    } else {
      flattenJSON(obj[key], res, `${prefix}${key}.`)
    }
  }
  return res
}

function buildRow(
  log: DocumentLogWithMetadataAndError,
  providerOutputs: Map<string, ProviderOutput>,
  columns: Column[],
): DatasetRowData {
  const providerOutput = providerOutputs.get(log.uuid)?.output
  const parameters = log.parameters ?? {}
  const logObject = flattenJSON(log)

  return columns.reduce((acc, column) => {
    if (column.role === 'parameter') {
      acc[column.identifier] = parameters[column.name] ?? null
    } else if (column.role === 'label') {
      acc[column.identifier] = providerOutput ?? null
    } else if (column.role === 'metadata') {
      acc[column.identifier] = logObject[column.name] ?? null
    }
    return acc
  }, {} as DatasetRowData)
}

export function buildRows(
  logs: DocumentLogWithMetadataAndError[],
  providerOutputs: Map<string, ProviderOutput>,
  columns: Column[],
): DatasetRowData[] {
  return logs.map((log) => buildRow(log, providerOutputs, columns))
}
