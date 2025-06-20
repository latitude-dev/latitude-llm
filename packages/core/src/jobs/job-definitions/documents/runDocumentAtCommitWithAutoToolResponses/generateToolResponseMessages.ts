import { ToolCall, readMetadata } from '@latitude-data/compiler'
import {
  ToolCallResponse,
  buildResponseMessage,
} from '@latitude-data/constants'
import { scan } from 'promptl-ai'
import {
  Commit,
  DocumentVersion,
  LogSources,
  Workspace,
} from '../../../../browser'
import { ToolSchema } from '../../../../services/ai'
import { runDocumentAtCommit } from '../../../../services/commits/runDocumentAtCommit'
import { TelemetryContext, telemetry } from '../../../../telemetry'
import { Result } from './../../../../lib/Result'
import { UnprocessableEntityError } from './../../../../lib/errors'
import { AutogenerateToolResponseCopilotData } from './getCopilotData'

async function buildToolSpecifications({
  document,
  toolCalls,
  customPrompt,
}: {
  document: DocumentVersion
  toolCalls: ToolCall[]
  customPrompt?: string
}) {
  const prompt = customPrompt ?? document.content

  const metadata =
    document.promptlVersion === 0
      ? await readMetadata({ prompt })
      : await scan({ prompt })
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
  context,
  workspace,
  commit,
  document,
  customPrompt,
  toolCalls,
  copilot,
  source,
}: {
  context: TelemetryContext
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  customPrompt?: string
  toolCalls: ToolCall[]
  source: LogSources
  copilot: AutogenerateToolResponseCopilotData
}) {
  if (toolCalls.length < 1) return Result.ok([])

  const $tools = toolCalls.map((toolCall) => ({
    id: toolCall.id,
    generated: false,
    ...telemetry().tool(context, {
      name: toolCall.name,
      call: {
        id: toolCall.id,
        arguments: toolCall.arguments,
      },
    }),
  }))

  const customIdentifier = buildIdentifier({
    workspace,
    commit,
    document,
  })

  const toolSpecificationsResult = await buildToolSpecifications({
    document,
    toolCalls,
    customPrompt,
  })
  if (toolSpecificationsResult.error) {
    $tools.forEach((tool) => tool.fail(toolSpecificationsResult.error))
    return toolSpecificationsResult
  }

  // Auto-generate tool response messages
  // We pass the tool specifications of the tool calls returned by the AI
  // With that we ask AI to generate mock tool responses.
  const result = await runDocumentAtCommit({
    context: $tools[0]!.context,
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

  if (result.error) {
    $tools.forEach((tool) => tool.fail(result.error))
    return result
  }
  const responseResult = result.unwrap()

  const responseError = await responseResult.error
  if (responseError) {
    $tools.forEach((tool) => tool.fail(responseError))
    return Result.error(responseError)
  }

  const response = (await responseResult.lastResponse)!
  if (response.streamType === 'text') {
    const error = new Error(
      'Invalid response. AI returned text while generating a mock tool response',
    )
    $tools.forEach((tool) => tool.fail(error))
    return Result.error(error)
  }

  const object = response.object as AutogenerateToolResponseObject
  const toolCallResponses = object.tool_responses
  const messages = toolCallResponses
    .map((toolCallResponse) => {
      const $tool = $tools.find(({ id }) => id === toolCallResponse.id)
      if ($tool) {
        $tool.end({
          result: {
            value: toolCallResponse.result ?? toolCallResponse.text,
            isError: !!toolCallResponse.isError,
          },
        })
        $tool.generated = true
      }
      return buildResponseMessage({
        type: 'text',
        data: { text: undefined, toolCallResponses: [toolCallResponse] },
      })
    })
    .filter((message) => message !== undefined)

  $tools
    .filter((tool) => !tool.generated)
    .forEach((tool) => tool.fail(new Error('Tool response generation failed')))

  return Result.ok(messages)
}
