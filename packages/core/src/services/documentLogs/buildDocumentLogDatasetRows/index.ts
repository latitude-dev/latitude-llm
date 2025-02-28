import { nanoid } from 'nanoid'
import { Workspace } from '../../../browser'
import { PromisedResult, Result } from '../../../lib'
import { Column, DatasetRowData } from '../../../schema'
import { buildColumn, HashAlgorithmFn } from '../../datasetsV2/utils'

type DocumentLogId = Omit<Column, 'name'> & { name: 'document_log_id' }
type TokensColumn = Omit<Column, 'name'> & { name: 'tokens' }
type OutputColumn = Omit<Column, 'name'> & { name: 'expected_output' }
type DocumentLogColumns = readonly [
  DocumentLogId,
  ...Column[],
  TokensColumn,
  OutputColumn,
]

export type ExportedDocumentLogs = {
  columns: DocumentLogColumns
  rows: DatasetRowData
}

/* const columns = Array.from(uniqueHeaders.keys()).map( */
/*   buildColumn(hashAlgorithm), */
/* ) */

/**
 * This service is responsible of extracting all data
 * interesting to run evaluations from document logs.
 * At the time of writing this is used to store the logs as
 * datasets rows in an existing dataset or new dataset.
 *
 * Extracted data:
 * - Document log id
 * - Tokens
 * - Output (from latest provider log)
 * - Parameters (from document log)
 */
export async function buildDocumentLogDatasetRows({
  hashAlgorithm = nanoid,
}: {
  workspace: Workspace
  documentLogIds: number[]
  hashAlgorithm: HashAlgorithmFn
}): PromisedResult<ExportedDocumentLogs> {
  // Find document logs with Non-errored logs repository

  const columnBuilder = buildColumn(hashAlgorithm)
  // TODO: Make this real. Pick arguments from ALL logs
  // generate all possible columns without duplicates
  const logArguments = [columnBuilder('yet_another_col')]

  const columns = [
    buildColumn<'document_log_id'>(hashAlgorithm)('document_log_id'),
    ...logArguments,
    buildColumn<'tokens'>(hashAlgorithm)('tokens'),
    buildColumn<'expected_output'>(hashAlgorithm)('expected_output'),
  ] as const

  // Extract tokens and output from latest provider log

  return Result.ok({ columns, rows: {} })
}
