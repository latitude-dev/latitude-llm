import {
  buildResponseMessage,
  ErrorableEntity,
  LogSources,
  Workspace,
} from '../../../browser'
import { NotFoundError, Result } from '../../../lib'
import {
  DocumentLogsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { getCachedChain } from '../../chains/chainCache'
import { runChain } from '../../chains/run'
import { buildProvidersMap } from '../../providerApiKeys/buildMap'
import { ToolCallResponse } from '@latitude-data/constants'
import { Message } from '@latitude-data/compiler'

function buildToolResponseMessages({
  toolCallResponses,
}: {
  toolCallResponses: ToolCallResponse[]
}) {
  return toolCallResponses
    .map((tool) => {
      return buildResponseMessage<'text'>({
        type: 'text',
        data: { text: tool.text, toolCallResponses: [tool] },
      })
    })
    .filter((m) => !!m)
}

export async function resumeConversation({
  workspace,
  documentLogUuid,
  commitUuid,
  toolCallResponses,
  source,
}: {
  workspace: Workspace
  documentLogUuid: string
  commitUuid?: string
  toolCallResponses: ToolCallResponse[]
  source: LogSources
}) {
  if (toolCallResponses.length <= 0) {
    return Result.error(
      new Error('No tool call responses provided to resume conversation'),
    )
  }

  const errorableType = ErrorableEntity.DocumentLog
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const cachedData = await getCachedChain({ workspace, documentLogUuid })

  if (!cachedData) {
    return Result.error(
      new NotFoundError(
        `Chain not found in cache for document log with UUID: ${documentLogUuid}`,
      ),
    )
  }

  const { chain, messages } = cachedData
  const logRep = new DocumentLogsRepository(workspace.id)
  const logResult = await logRep.findByUuid(documentLogUuid)
  if (logResult.error) return logResult

  const documentLog = logResult.value
  const documentsRepo = new DocumentVersionsRepository(workspace.id)
  const result = await documentsRepo.getDocumentByUuid({
    commitUuid,
    documentUuid: documentLog.documentUuid,
  })
  if (result.error) return result

  const document = result.value
  const errorableUuid = documentLogUuid

  let extraMessages = messages as unknown as Message[]

  const responseToolMessages = buildToolResponseMessages({
    toolCallResponses,
  })
  extraMessages = extraMessages.concat(responseToolMessages)

  const run = await runChain({
    generateUUID: () => errorableUuid,
    errorableType,
    workspace,
    chain,
    promptlVersion: document.promptlVersion,
    providersMap,
    source,
    extraMessages,
  })

  // TODO: Delete cache when chain.chainCompleted

  return Result.ok({
    stream: run.stream,
    duration: run.duration,
    resolvedContent: result.value,
    errorableUuid,
    response: run.response,
  })
}
