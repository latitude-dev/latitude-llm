import { Workspace } from '../../../browser'
import { Column, DatasetRowData } from '../../../schema'

type TokensColumn = Omit<Column, 'name'> & { name: 'tokens' }
type OutputColumn = Omit<Column, 'name'> & { name: 'output' }
type DocumentLogColumns = [TokensColumn, OutputColumn, ...Column[]]

export type ExportedDocumentLogs = {
  columns: DocumentLogColumns
  rows: DatasetRowData
}

export async function buildDocumentLogsRows({
  workspace,
  documentLogIds,
}: {
  workspace: Workspace
  documentLogIds: number[]
}) {
  // Find document logs with Non-errored logs repository
  // Extract tokens and output from latest provider log
  // Extract parameters from document log
}
