import { Dataset, Workspace } from '../../../browser'
import { Column, DatasetRowData, documentLogs } from '../../../schema'
import { HashAlgorithmFn, nanoidHashAlgorithm } from '../../datasets/utils'
import {
  DocumentLogWithMetadataAndError,
  ProviderLogsRepository,
} from '../../../repositories'
import { buildColumns, FixedColumnsByName } from './buildColumns'
import { desc } from 'drizzle-orm'
import { PromisedResult } from './../../../lib/Transaction'
import { Result } from './../../../lib/Result'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../../repositories/documentLogsWithMetadataAndErrorsRepository'
import { buildProviderLogResponse } from '../../providerLogs'

export type ExportedDocumentLogs = {
  columns: Column[]
  rows: DatasetRowData[]
}

async function findLogs({
  workspace,
  documentLogIds,
}: {
  workspace: Workspace
  documentLogIds: number[]
}) {
  // TODO(perf): remove this repo
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id)
  const results = await repo
    .findMany(documentLogIds, { ordering: [desc(documentLogs.createdAt)] })
    .then((r) => r.unwrap())

  return results.filter((r) => !r.error.message)
}

type ExpectedOutputByLog = { output: string; generatedAt: Date }
async function findExpectedOutputs({
  workspace,
  logs,
}: {
  workspace: Workspace
  logs: DocumentLogWithMetadataAndError[]
}) {
  const repo = new ProviderLogsRepository(workspace.id)
  const providers = await repo.findManyByDocumentLogUuid(
    logs.map((log) => log.uuid),
  )

  return providers.reduce(
    (acc, provider) => {
      if (!provider.documentLogUuid) return acc
      if (provider.generatedAt === null) return acc

      const existing = acc.get(provider.documentLogUuid)
      if (existing && existing.generatedAt > provider.generatedAt) return acc

      const output = buildProviderLogResponse(provider)

      acc.set(provider.documentLogUuid, {
        output,
        generatedAt: provider.generatedAt,
      })
      return acc
    },
    new Map() as Map<string, ExpectedOutputByLog>,
  )
}

function buildRow({
  log,
  expectedOutputs,
  parametersByName,
  fixedColumnsByName,
}: {
  log: DocumentLogWithMetadataAndError
  expectedOutputs: Map<string, ExpectedOutputByLog>
  fixedColumnsByName: FixedColumnsByName
  parametersByName: Record<string, Column>
}) {
  const expectedOutput = expectedOutputs.get(log.uuid)?.output
  if (!expectedOutput) return null

  const parameters = log.parameters ?? {}

  const logParameterColumns: DatasetRowData = {}

  for (const [name, column] of Object.entries(parametersByName)) {
    const value = parameters[name]
    logParameterColumns[column.identifier] =
      value !== undefined ? (value as DatasetRowData[keyof DatasetRowData]) : ''
  }

  return {
    ...logParameterColumns,
    [fixedColumnsByName.label.identifier]: expectedOutput,
    [fixedColumnsByName.documentLogId.identifier]: log.id,
    [fixedColumnsByName.tokens.identifier]: log.tokens ?? 0,
  }
}

/**
 * This service is responsible of extracting all data
 * interesting to run evaluations from document logs.
 * At the time of writing this is used to store the logs as
 * datasets rows in an existing dataset or new dataset.
 *
 * Extracted data:
 * - Parameters (from document log)
 * - Expected Output (from latest provider log)
 * - Document log id
 * - Tokens
 */
export async function buildDocumentLogDatasetRows({
  workspace,
  dataset,
  documentLogIds,
  hashAlgorithm = nanoidHashAlgorithm,
}: {
  workspace: Workspace
  documentLogIds: number[]
  dataset?: Dataset
  hashAlgorithm?: HashAlgorithmFn
}): PromisedResult<ExportedDocumentLogs> {
  const logs = await findLogs({ workspace, documentLogIds })
  const expectedOutputs = await findExpectedOutputs({ workspace, logs })
  const columns = buildColumns({ dataset, hashAlgorithm, logs })
  const rows = logs
    .map((log) =>
      buildRow({
        log,
        expectedOutputs: expectedOutputs,
        parametersByName: columns.parametersByName,
        fixedColumnsByName: columns.fixedColumnsByName,
      }),
    )
    .filter((row) => row !== null)

  return Result.ok({ columns: columns.allColumns, rows })
}
