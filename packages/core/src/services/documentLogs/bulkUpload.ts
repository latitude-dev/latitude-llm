import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { LogSources } from '../../constants'
import { queues } from '../../jobs/queues'
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
  const { defaultQueue } = await queues()
  defaultQueue.add('uploadDocumentLogsJob', {
    workspaceId: workspace.id,
    documentUuid: document.documentUuid,
    commit,
    csv,
    source: LogSources.User,
  })
}
