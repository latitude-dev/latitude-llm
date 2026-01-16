import { Job } from 'bullmq'
import { PassThrough } from 'stream'
import { stringify } from 'csv-stringify'

import {
  SpanMetadata,
  SpanType,
  Span,
  DEFAULT_DATASET_LABEL,
  DATASET_COLUMN_ROLES,
} from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { diskFactory } from '../../../lib/disk'
import { Result } from '../../../lib/Result'
import { SpanMetadatasRepository, SpansRepository } from '../../../repositories'
import { findByUuid } from '../../../data-access/exports/findByUuid'
import { markExportReady } from '../../../services/exports/markExportReady'
import { queues } from '../../queues'
import { formatMessage } from '../../../helpers'
import { Message } from '@latitude-data/constants/legacyCompiler'
import {
  buildColumns as buildColumnsFn,
  nanoidHashAlgorithm,
} from '../../../services/datasets/utils'
import { Column } from '../../../schema/models/datasets'
import { DatasetRowData } from '../../../schema/models/datasetRows'

export type ExportSpansJobData = {
  exportUuid: string
  workspaceId: number
  userId: string
  documentUuid: string
  selectionMode: 'ALL' | 'ALL_EXCEPT' | 'PARTIAL'
  excludedSpanIdentifiers: Array<{ traceId: string; spanId: string }>
  selectedSpanIdentifiers?: Array<{ traceId: string; spanId: string }>
  filters: {
    commitUuids?: string[]
    experimentUuids?: string[]
    testDeploymentIds?: number[]
    createdAt?: { from?: Date; to?: Date }
  }
}

export async function enqueueExportSpansJob(data: ExportSpansJobData) {
  const { defaultQueue } = await queues()
  return defaultQueue.add('exportSpansJob', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    jobId: data.exportUuid,
    deduplication: { id: data.exportUuid },
    removeOnComplete: true,
    removeOnFail: false,
  })
}

const BATCH_SIZE = 500

type FixedColumnsByName = {
  label: Column
  spanId: Column
  traceId: Column
  tokens: Column
}

async function* iterateSpans({
  repo,
  documentUuid,
  filters,
  excludedIds,
  selectionMode,
  selectedSpanIds,
}: {
  repo: SpansRepository
  documentUuid: string
  filters: ExportSpansJobData['filters']
  excludedIds: Set<string>
  selectionMode: 'ALL' | 'ALL_EXCEPT' | 'PARTIAL'
  selectedSpanIds?: Set<string>
}) {
  let cursor: { startedAt: string; id: string } | undefined

  while (true) {
    const result = await repo.findByDocumentAndCommitLimited({
      documentUuid,
      commitUuids: filters.commitUuids,
      experimentUuids: filters.experimentUuids,
      testDeploymentIds: filters.testDeploymentIds,
      createdAt: filters.createdAt,
      types: [SpanType.Prompt],
      limit: BATCH_SIZE,
      from: cursor,
    })

    if (result.error) {
      throw result.error
    }

    const { items, next } = result.value!

    for (const span of items) {
      const spanKey = `${span.traceId}:${span.id}`

      if (selectionMode === 'ALL_EXCEPT' && excludedIds.has(spanKey)) {
        continue
      }

      if (
        selectionMode === 'PARTIAL' &&
        selectedSpanIds &&
        !selectedSpanIds.has(spanKey)
      ) {
        continue
      }

      yield span
    }

    if (!next) break
    cursor = next
  }
}

async function buildRowsForBatch({
  spans,
  repo,
  metadataRepo,
  parametersByName,
  fixedColumnsByName,
}: {
  spans: Span[]
  repo: SpansRepository
  metadataRepo: SpanMetadatasRepository
  parametersByName: Record<string, Column>
  fixedColumnsByName: FixedColumnsByName
}): Promise<DatasetRowData[]> {
  const parentIds = spans.map((s) => ({ traceId: s.traceId, spanId: s.id }))
  const completionsResult = await repo.findCompletionsByParentIds(parentIds)

  if (completionsResult.error) {
    throw completionsResult.error
  }

  const completionsByParent = completionsResult.value!

  const metadatas = await metadataRepo.getBatch<SpanType.Prompt>(parentIds)

  const completionSpans = Array.from(completionsByParent.values())
  const completionMetadatas = await metadataRepo.getBatch<SpanType.Completion>(
    completionSpans.map((c) => ({ traceId: c.traceId, spanId: c.id })),
  )

  const rows: DatasetRowData[] = []

  for (const span of spans) {
    const spanKey = `${span.traceId}:${span.id}`
    const metadata = metadatas.get(spanKey)
    const completionSpan = completionsByParent.get(spanKey)

    let output: string | undefined
    if (completionSpan) {
      const completionKey = `${completionSpan.traceId}:${completionSpan.id}`
      const completionMetadata = completionMetadatas.get(completionKey)

      if (
        completionMetadata &&
        completionMetadata.type === SpanType.Completion
      ) {
        const completionOutput = (
          completionMetadata as SpanMetadata<SpanType.Completion>
        ).output
        if (
          completionOutput &&
          Array.isArray(completionOutput) &&
          completionOutput.length > 0
        ) {
          const lastMessage = completionOutput[completionOutput.length - 1]
          if (lastMessage) {
            const formatted = formatMessage(lastMessage as unknown as Message)
            if (formatted) {
              output = formatted
            }
          }
        }
      }
    }

    if (!output) continue

    const parameters = metadata?.parameters ?? {}
    const spanParameterColumns: DatasetRowData = {}

    for (const [name, column] of Object.entries(parametersByName)) {
      const value = parameters[name]
      spanParameterColumns[column.identifier] =
        value !== undefined
          ? (value as DatasetRowData[keyof DatasetRowData])
          : ''
    }

    const tokens =
      ((span as any).tokensPrompt ?? 0) +
      ((span as any).tokensCompletion ?? 0) +
      ((span as any).tokensCached ?? 0) +
      ((span as any).tokensReasoning ?? 0)

    rows.push({
      ...spanParameterColumns,
      [fixedColumnsByName.label.identifier]: output,
      [fixedColumnsByName.spanId.identifier]: span.id,
      [fixedColumnsByName.traceId.identifier]: span.traceId,
      [fixedColumnsByName.tokens.identifier]: tokens,
    })
  }

  return rows
}

function buildFixedColumns(hashAlgorithm: typeof nanoidHashAlgorithm): {
  columns: Column[]
  fixedColumnsByName: FixedColumnsByName
} {
  const fixedColumnDefs = [
    { name: DEFAULT_DATASET_LABEL, role: DATASET_COLUMN_ROLES.label },
    { name: 'span_id', role: DATASET_COLUMN_ROLES.metadata },
    { name: 'trace_id', role: DATASET_COLUMN_ROLES.metadata },
    { name: 'tokens', role: DATASET_COLUMN_ROLES.metadata },
  ]

  const columns = buildColumnsFn({
    hashAlgorithm,
    newColumns: fixedColumnDefs,
    prevColumns: [],
  })

  const fixedColumnsByName = columns.reduce<FixedColumnsByName>(
    (acc, column) => {
      if (column.role === DATASET_COLUMN_ROLES.label) {
        acc.label = column
      } else if (column.name === 'span_id') {
        acc.spanId = column
      } else if (column.name === 'trace_id') {
        acc.traceId = column
      } else if (column.name === 'tokens') {
        acc.tokens = column
      }
      return acc
    },
    {} as FixedColumnsByName,
  )

  return { columns, fixedColumnsByName }
}

export const exportSpansJob = async (job: Job<ExportSpansJobData>) => {
  const {
    exportUuid,
    workspaceId,
    documentUuid,
    selectionMode,
    excludedSpanIdentifiers,
    selectedSpanIdentifiers,
    filters,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    return Result.error(new Error(`Workspace ${workspaceId} not found`))
  }

  const exportRecord = await findByUuid({ uuid: exportUuid, workspace })
  if (!exportRecord) {
    return Result.error(new Error(`Export ${exportUuid} not found`))
  }

  const repo = new SpansRepository(workspaceId)
  const metadataRepo = new SpanMetadatasRepository(workspaceId)
  const disk = diskFactory('private')

  const excludedIds = new Set(
    excludedSpanIdentifiers.map((id) => `${id.traceId}:${id.spanId}`),
  )

  const selectedSpanIds = selectedSpanIdentifiers
    ? new Set(selectedSpanIdentifiers.map((id) => `${id.traceId}:${id.spanId}`))
    : undefined

  const { columns, fixedColumnsByName } = buildFixedColumns(nanoidHashAlgorithm)

  const parametersByName: Record<string, Column> = {}

  const csvColumns = columns.map((col) => col.name)

  const passThrough = new PassThrough()
  const csvStringifier = stringify({
    header: true,
    columns: csvColumns,
  })

  csvStringifier.pipe(passThrough)

  const fileKey = exportRecord.fileKey
  const uploadPromise = disk.putStream(fileKey, passThrough)

  let batch: Span[] = []

  for await (const span of iterateSpans({
    repo,
    documentUuid,
    filters,
    excludedIds,
    selectionMode,
    selectedSpanIds,
  })) {
    batch.push(span)

    if (batch.length >= BATCH_SIZE) {
      const rows = await buildRowsForBatch({
        spans: batch,
        repo,
        metadataRepo,
        parametersByName,
        fixedColumnsByName,
      })

      for (const row of rows) {
        const csvRow = columns.map((col) => {
          const value = row[col.identifier]
          return value !== undefined ? String(value) : ''
        })
        csvStringifier.write(csvRow)
      }

      batch = []
    }
  }

  if (batch.length > 0) {
    const rows = await buildRowsForBatch({
      spans: batch,
      repo,
      metadataRepo,
      parametersByName,
      fixedColumnsByName,
    })

    for (const row of rows) {
      const csvRow = columns.map((col) => {
        const value = row[col.identifier]
        return value !== undefined ? String(value) : ''
      })
      csvStringifier.write(csvRow)
    }
  }

  csvStringifier.end()

  const uploadResult = await uploadPromise
  if (uploadResult.error) {
    return Result.error(uploadResult.error)
  }

  return markExportReady({ export: exportRecord })
}
