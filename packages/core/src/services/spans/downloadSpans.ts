import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { Workspace } from '../../schema/models/types/Workspace'
import { findOrCreateExport } from '../exports/findOrCreate'
import {
  enqueueExportSpansJob,
  ExportSpansJobData,
} from '../../jobs/job-definitions/exports/exportSpansJob'

const MAX_SYNC_SPANS_BATCH_SIZE = 25

export type SpanIdentifier = {
  traceId: string
  spanId: string
}

export type DownloadSpansFilters = {
  commitUuids?: string[]
  experimentUuids?: string[]
  testDeploymentIds?: number[]
  createdAt?: { from?: Date; to?: Date }
}

export type DownloadSpansParams = {
  workspace: Workspace
  projectId: number
  userId: string
  documentUuid: string
  selectionMode: 'ALL' | 'ALL_EXCEPT' | 'PARTIAL'
  selectedSpanIdentifiers: SpanIdentifier[]
  excludedSpanIdentifiers: SpanIdentifier[]
  filters?: DownloadSpansFilters
}

export type SyncDownloadResult = {
  mode: 'sync'
  spanIdentifiers: SpanIdentifier[]
}

export type AsyncDownloadResult = {
  mode: 'async'
  exportUuid: string
}

export type DownloadSpansResult = SyncDownloadResult | AsyncDownloadResult

/**
 * Downloads spans either synchronously (for small batches) or asynchronously (for larger batches).
 * Synchronous mode returns span identifiers immediately for client-side download.
 * Asynchronous mode creates an export job that generates a CSV file.
 */
export async function downloadSpans({
  workspace,
  projectId,
  userId,
  documentUuid,
  selectionMode,
  selectedSpanIdentifiers,
  excludedSpanIdentifiers,
  filters,
}: DownloadSpansParams): PromisedResult<DownloadSpansResult> {
  // For partial selections with small batch sizes, return sync mode
  if (
    selectionMode === 'PARTIAL' &&
    selectedSpanIdentifiers.length <= MAX_SYNC_SPANS_BATCH_SIZE
  ) {
    return Result.ok({
      mode: 'sync' as const,
      spanIdentifiers: selectedSpanIdentifiers,
    })
  }

  // For larger batches or non-partial selections, use async export
  const exportUuid = crypto.randomUUID()
  const fileKey = `exports/${exportUuid}.csv`

  const exportResult = await findOrCreateExport({
    uuid: exportUuid,
    workspace,
    userId,
    fileKey,
  })

  if (exportResult.error) return exportResult

  const jobFilters: ExportSpansJobData['filters'] = {
    commitUuids: filters?.commitUuids,
    experimentUuids: filters?.experimentUuids,
    testDeploymentIds: filters?.testDeploymentIds,
    createdAt: filters?.createdAt,
  }

  await enqueueExportSpansJob({
    exportUuid,
    workspaceId: workspace.id,
    projectId,
    userId,
    documentUuid,
    selectionMode,
    excludedSpanIdentifiers,
    selectedSpanIdentifiers:
      selectionMode === 'PARTIAL' ? selectedSpanIdentifiers : undefined,
    filters: jobFilters,
  })

  return Result.ok({
    mode: 'async' as const,
    exportUuid,
  })
}
