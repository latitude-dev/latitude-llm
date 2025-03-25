import { DatasetV2, Workspace } from '../../../browser'
import { PromisedResult, Result } from '../../../lib'
import { Column, DatasetRowData, documentLogs } from '../../../schema'
import { HashAlgorithmFn, nanoidHashAlgorithm } from '../../datasetsV2/utils'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../../repositories/documentLogsWithMetadataAndErrorsRepository'
import {
  DocumentLogWithMetadataAndError,
  ProviderLogsRepository,
} from '../../../repositories'
import { ContentType, Message, MessageContent } from '@latitude-data/compiler'
import { buildColumns, FixedColumnsByName } from './buildColumns'
import { buildResponseMessage, ProviderLog } from '@latitude-data/constants'
import { desc } from 'drizzle-orm'

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
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id)
  const logsWithErrors = await repo
    .findMany(documentLogIds, { ordering: [desc(documentLogs.createdAt)] })
    .then((r) => r.unwrap())
  return logsWithErrors.filter((log) => !log.error.message)
}

// This should never happen
const NO_RESPONSE_FOUND = 'NO RESPONSE FOUND'

function isJsonString(str: string) {
  try {
    JSON.parse(str)
    return true
  } catch (e) {
    return false
  }
}

function itemContentByType(item: MessageContent) {
  switch (item.type) {
    case ContentType.text:
      return item.text
    case ContentType.image:
      return item.image.toString()
    case ContentType.file:
      return item.file.toString()
    case ContentType.toolCall:
      return JSON.stringify(item)
    case ContentType.toolResult:
      return JSON.stringify(item)
    default:
      return item
  }
}

function parseContentItem(item: MessageContent | string) {
  try {
    const content = typeof item === 'string' ? item : itemContentByType(item)
    const isJson = isJsonString(content)

    if (!isJson) return content

    return JSON.stringify(content, null, 2)
  } catch (e) {
    return NO_RESPONSE_FOUND
  }
}

function parseOutputFromMessage(message: Message) {
  const content = message.content
  if (typeof content === 'string' || !Array.isArray(content)) {
    return parseContentItem(content)
  }

  return content.map(parseContentItem).join('\n')
}

function getOutput(provider: ProviderLog) {
  const typeByResponse = provider.responseText ? 'text' : 'object'
  let responseMessage: Message | undefined

  if (typeByResponse === 'text') {
    responseMessage = buildResponseMessage({
      type: 'text',
      data: {
        text: provider.responseText ?? '',
        toolCalls: provider.toolCalls,
      },
    })
  } else {
    responseMessage = buildResponseMessage({
      type: 'object',
      data: {
        object: provider.responseObject,
        text: provider.responseText ?? undefined,
      },
    })
  }
  if (!responseMessage) return NO_RESPONSE_FOUND

  return parseOutputFromMessage(responseMessage)
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

      const output = getOutput(provider)

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
  dataset?: DatasetV2
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
