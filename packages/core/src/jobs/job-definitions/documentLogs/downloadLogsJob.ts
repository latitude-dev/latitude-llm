import { Job } from 'bullmq'
import { ExtendedDocumentLogFilterOptions } from '../../../constants'
import { User } from '../../../browser'
import { Workspace } from '../../../browser'
import { diskFactory } from '../../../lib/disk'
import { markExportReady } from '../../../services/exports/markExportReady'
import { findOrCreateExport } from '../../../services/exports/findOrCreate'
import { Readable } from 'stream'
import { ColumnFilters } from '../../../services/documentLogs/buildDocumentLogDataset'
import { generateCsvFromLogs } from '../../../services/datasets/generateCsvFromLogs'

export const downloadLogsJob = async (
  job: Job<{
    user: User
    token: string
    workspace: Workspace
    documentUuid: string
    extendedFilterOptions: ExtendedDocumentLogFilterOptions
    columnFilters?: ColumnFilters
  }>,
) => {
  const {
    user,
    token,
    workspace,
    documentUuid,
    extendedFilterOptions,
    columnFilters,
  } = job.data

  const logsCsv = await generateCsvFromLogs({
    workspace,
    documentUuid,
    extendedFilterOptions,
    columnFilters,
  }).then((r) => r.unwrap())

  const readStream = new Readable({
    highWaterMark: logsCsv.length,
  })

  const fileKey = `workspaces/${workspace.id}/exports/${token}.csv`
  readStream.push(logsCsv)
  readStream.push(null)

  const disk = diskFactory()
  const exists = await disk.exists(fileKey)
  if (exists) await disk.delete(fileKey)
  await disk
    .putStream(fileKey, readStream, {
      contentType: 'text/csv',
    })
    .then((r) => r.unwrap())

  const exportRecord = await findOrCreateExport({
    uuid: token,
    workspace,
    userId: user.id,
    fileKey,
  }).then((r) => r.unwrap())
  await markExportReady({ export: exportRecord }).then((r) => r.unwrap())

  return { totalProcessed: logsCsv.split(/\n/).length - 1 }
}
