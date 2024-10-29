import { Commit, DocumentVersion, Workspace } from '../../browser'
import { LogSources } from '../../constants'
import { setupJobs } from '../../jobs'
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
  const queues = await setupJobs()

  queues.defaultQueue.jobs.enqueueUploadDocumentLogsJob({
    workspaceId: workspace.id,
    documentUuid: document.documentUuid,
    commit,
    csv,
    source: LogSources.User,
  })
}
