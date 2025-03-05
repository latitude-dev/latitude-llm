import { Result } from '../../lib'
import { Workspace } from '../../browser'
import { buildDocumentLogDatasetRows } from '../documentLogs/buildDocumentLogDatasetRows'
import { nanoidHashAlgorithm } from './utils'

export const generateCsvFromLogs = async ({
  workspace,
  data,
}: {
  workspace: Workspace
  data: {
    documentLogIds: number[]
  }
}) => {
  const result = await buildDocumentLogDatasetRows({
    workspace,
    documentLogIds: data.documentLogIds,
    hashAlgorithm: nanoidHashAlgorithm,
  })

  if (result.error) return result

  const { columns, rows } = result.value

  const headerRow = columns.map((col) => col.name).join(',')

  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const value = row[col.identifier]
        if (typeof value === 'string') {
          return `"${value.replace(/"/g, '""')}"` // Escape quotes
        }
        return value ?? ''
      })
      .join(','),
  )

  const csvString = [headerRow, ...dataRows].join('\n')

  return Result.ok(csvString)
}
