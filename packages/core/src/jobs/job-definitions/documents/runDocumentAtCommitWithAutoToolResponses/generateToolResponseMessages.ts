import { scan } from 'promptl-ai'
import { ToolCall, readMetadata } from '@latitude-data/compiler'
import {
  Commit,
  DocumentVersion,
  LogSources,
  Workspace,
} from '../../../../browser'
import { Result, UnprocessableEntityError } from '../../../../lib'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'
import { runDocumentAtCommit } from '../../../../services/commits/runDocumentAtCommit'
import {
  buildResponseMessage,
  ToolCallResponse,
} from '@latitude-data/constants'
import { ToolSchema } from '../../../../services/ai'

async function buildToolSpecifications({
  document,
  toolCalls,
}: {
  document: DocumentVersion
  toolCalls: ToolCall[]
}) {
  const metadata =
    document.promptlVersion === 0
      ? await readMetadata({ prompt: document.content })
      : await scan({ prompt: document.content })
  const schemas = metadata.config.tools as
    | Record<string, ToolSchema>
    | undefined
  const toolCallNames = toolCalls.map((toolCall) => toolCall.name)
  const specKeys = Object.keys(schemas ?? {})

  if (!specKeys.length) {
    return Result.error(
      new UnprocessableEntityError(
        'No tool specifications found in the document',
        {
          documentUuid: document.documentUuid,
        },
      ),
    )
  }

  const toolSpecs = specKeys.reduce(
    (acc, key) => {
      if (schemas && toolCallNames.includes(key)) {
        const toolSpec = schemas[key]
        if (!toolSpec) return acc
        acc[key] = toolSpec
      }
      return acc
    },
    {} as Record<string, ToolSchema>,
  )
  return Result.ok(toolSpecs)
}

function buildIdentifier({
  workspace,
  commit,
  document,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}) {
  return `aigentool-w:${workspace.id}-cmt:${commit.id}-doc:${document.documentUuid}`
}

type AutogenerateToolResponseObject = {
  tool_responses: ToolCallResponse[]
}

export async function generateToolResponseMessages({
  workspace,
  commit,
  document,
  toolCalls,
  copilot,
  source,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  toolCalls: ToolCall[]
  source: LogSources
  copilot: AutogenerateToolResponseCopilotData
}) {
  const customIdentifier = buildIdentifier({
    workspace,
    commit,
    document,
  })

  const toolSpecificationsResult = await buildToolSpecifications({
    document,
    toolCalls,
  })
  if (toolSpecificationsResult.error) return toolSpecificationsResult

  // Auto-generate tool response messages
  // We pass the tool specifications of the tool calls returned by the AI
  // With that we ask AI to generate mock tool responses.
  const result = await runDocumentAtCommit({
    workspace: copilot.workspace,
    commit: copilot.commit,
    document: copilot.document,
    parameters: {
      toolSpecifications: toolSpecificationsResult.value,
      toolCalls,
    },
    customIdentifier,
    source,
  })

  if (result.error) return result
  const responseResult = result.unwrap()

  const responseError = await responseResult.error
  if (responseError) {
    return Result.error(responseError)
  }

  const response = (await responseResult.lastResponse)!
  if (response.streamType === 'text') {
    return Result.error(
      new Error(
        'Invalid response. AI responed with text while generating a mock tool response',
      ),
    )
  }

  const object = response.object as AutogenerateToolResponseObject
  const toolCallResponses = object.tool_responses
  const messages = toolCallResponses
    .map((toolCallResponse) =>
      buildResponseMessage({
        type: 'text',
        data: { text: undefined, toolCallResponses: [toolCallResponse] },
      }),
    )
    .filter((message) => message !== undefined)

  return Result.ok(messages)
}
