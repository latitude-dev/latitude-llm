import type { Commit, DocumentVersion, Workspace } from '../../browser'
import { LogSources } from '../../constants'
import { defaultQueue } from '../../jobs/queues'
import { syncReadCsv } from '../../lib/readCsv'

export async function bulkUploadDocumentLogs({
  csvDelimiter,
  logsFile,
  workspace,
  document,
  commit,
}: {
  csvDelimiter: string
  logsFile: File
  workspace: Workspace
  document: DocumentVersion
  commit: Commit
}) {
  const csv = await syncReadCsv(logsFile, {
    delimiter: csvDelimiter,
    columns: false,
  }).then((r) => r.unwrap())
  defaultQueue.add('uploadDocumentLogsJob', {
    workspaceId: workspace.id,
    documentUuid: document.documentUuid,
    commit,
    csv,
    source: LogSources.User,
  })
}
