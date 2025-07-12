import {
  ToolCallResponse,
  buildResponseMessage,
} from '@latitude-data/constants'
import { scan } from 'promptl-ai'
import { ToolCall, ToolContent } from '@latitude-data/constants/legacyCompiler'
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

  const metadata = await scan({ prompt })
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

type GenerateProps = {
  context: TelemetryContext
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  customPrompt?: string
  toolCalls: ToolCall[]
  source: LogSources
  copilot: AutogenerateToolResponseCopilotData
}

export async function generateToolResponseMessages({
  context,
  toolCalls,
  ...rest
}: GenerateProps) {
  if (toolCalls.length < 1) return Result.ok([])

  const $tools = toolCalls.map((toolCall) => ({
    id: toolCall.id,
    ...telemetry.tool(context, {
      name: toolCall.name,
      call: {
        id: toolCall.id,
        arguments: toolCall.arguments,
      },
    }),
  }))

  let messages = []
  try {
    messages = await executeToolResponseMessages({
      context: $tools[0]!.context,
      toolCalls: toolCalls,
      ...rest,
    })
  } catch (error) {
    $tools.forEach(($tool) => $tool.fail(error as Error))
    return Result.error(error as Error)
  }

  const toolResults = messages.reduce((acc, message) => {
    if (message.role !== 'tool') return acc
    for (const content of message.content) {
      if (content.type !== 'tool-result') continue
      acc.push(content)
    }
    return acc
  }, [] as ToolContent[])

  $tools.forEach(($tool) => {
    const result = toolResults.find((r) => r.toolCallId === $tool.id)
    if (result) {
      $tool.end({
        result: {
          value: result.result,
          isError: !!result.isError,
        },
      })
    } else {
      $tool.fail(new Error('Tool response generation failed'))
    }
  })

  return Result.ok(messages)
}

export async function executeToolResponseMessages({
  context,
  workspace,
  commit,
  document,
  customPrompt,
  toolCalls,
  copilot,
  source,
}: GenerateProps) {
  const customIdentifier = buildIdentifier({
    workspace,
    commit,
    document,
  })

  const toolSpecifications = await buildToolSpecifications({
    document,
    toolCalls,
    customPrompt,
  }).then((r) => r.unwrap())

  // Auto-generate tool response messages
  // We pass the tool specifications of the tool calls returned by the AI
  // With that we ask AI to generate mock tool responses.
  const result = await runDocumentAtCommit({
    context: context,
    workspace: copilot.workspace,
    commit: copilot.commit,
    document: copilot.document,
    parameters: { toolSpecifications, toolCalls },
    customIdentifier,
    source,
  }).then((r) => r.unwrap())

  const error = await result.error
  if (error) throw error

  const response = (await result.lastResponse)!
  if (response.streamType === 'text') {
    throw new Error(
      'Invalid response. AI returned text while generating a mock tool response',
    )
  }

  const object = response.object as AutogenerateToolResponseObject
  const toolCallResponses = object?.tool_responses ?? []
  const messages = toolCallResponses
    .map((toolCallResponse) =>
      buildResponseMessage({
        type: 'text',
        data: { text: undefined, toolCallResponses: [toolCallResponse] },
      }),
    )
    .filter((message) => message !== undefined)

  return messages
}
