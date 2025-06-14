import { LatitudeApiError, LatitudeErrorCodes } from '$sdk/utils/errors'
import type { streamChat } from '$sdk/utils/streamChat'
import type { syncChat } from '$sdk/utils/syncChat'
import {
  ChatOptionsWithSDKOptions,
  ToolCalledFn,
  ToolHandler,
  ToolInstrumentation,
  ToolSpec,
} from '$sdk/utils/types'
import { Message, ToolCall } from '@latitude-data/compiler'
import {
  buildResponseMessage,
  ChainCallResponseDto,
  ChatSyncAPIResponse,
  TraceContext,
} from '@latitude-data/constants'

class ToolExecutionPausedError extends Error {
  constructor() {
    super('Execution paused')
    this.name = 'ToolExecutionPausedError'
  }
}

function pauseExecution() {
  throw new ToolExecutionPausedError()
}

export function hasTools<Tools extends ToolSpec>(
  tools: ToolCalledFn<Tools> | undefined,
): tools is ToolCalledFn<Tools> {
  return (
    tools !== undefined &&
    typeof tools === 'object' &&
    Object.keys(tools).length > 0
  )
}

const withoutToolHandler = (tools: string[]) => (toolRequest: ToolCall) => {
  return !tools.includes(toolRequest.name)
}

type ToolCallHandler<N> = Omit<ToolCall, 'name'> & {
  name: N
}
async function runHandler<T extends ToolSpec, K extends keyof T>({
  handler,
  toolRequest,
  conversationUuid,
  messages,
  requestedToolCalls,
  instrumentation,
}: {
  handler: ToolHandler<T, K>
  toolRequest: ToolCallHandler<K>
  requestedToolCalls: ToolCall[]
  conversationUuid: string
  messages: Message[]
  instrumentation?: ToolInstrumentation
}) {
  const toolName = toolRequest.name.toString()

  const handlerArgs = [
    toolRequest.arguments as T[typeof toolRequest.name],
    {
      toolId: toolRequest.id,
      toolName,
      pauseExecution,
      conversationUuid,
      messages,
      requestedToolCalls,
    },
  ] as const

  let result
  if (instrumentation) {
    result = await instrumentation.wrapToolHandler(handler, ...handlerArgs)
  } else {
    result = await handler(...handlerArgs)
  }

  const toolResponse = {
    id: toolRequest.id,
    name: toolName,
    result,
  }
  const message = buildResponseMessage<'text'>({
    type: 'text',
    data: {
      text: undefined,
      toolCallResponses: [toolResponse],
    },
  })
  return message!
}

async function runHandlers<Tools extends ToolSpec>({
  tools,
  toolRequests,
  conversationUuid,
  messages,
  instrumentation,
}: {
  tools: ToolCalledFn<Tools>
  toolRequests: ToolCall[]
  conversationUuid: string
  messages: Message[]
  instrumentation?: ToolInstrumentation
}) {
  return await Promise.all(
    toolRequests.map(async (toolRequest) => {
      const handler = tools[toolRequest.name]!
      return runHandler({
        handler,
        toolRequest,
        conversationUuid,
        messages,
        requestedToolCalls: toolRequests,
        instrumentation,
      })
    }),
  )
}

async function buildToolResponseMessages<Tools extends ToolSpec>({
  tools,
  toolRequests,
  conversationUuid,
  messages,
  traceContext,
  instrumentation,
}: {
  tools: ToolCalledFn<Tools>
  toolRequests: ToolCall[]
  conversationUuid: string
  messages: Message[]
  traceContext?: TraceContext
  instrumentation?: ToolInstrumentation
}) {
  const toolNames = Object.keys(tools)
  const toolRequestsWithoutHandler = toolRequests.filter(
    withoutToolHandler(toolNames),
  )

  if (toolRequestsWithoutHandler.length) {
    const uniqueToolRequestedWithoutHandler = toolRequestsWithoutHandler.reduce(
      (acc, toolRequest) => {
        acc.add(toolRequest.name)
        return acc
      },
      new Set<string>(),
    )
    const requestedNames = Array.from(uniqueToolRequestedWithoutHandler).join(
      ', ',
    )
    throw new LatitudeApiError({
      status: 400,
      message: `An AI request needs these tools: ${requestedNames} but are not declared in the tools object in the SDK. You declared these tools: ${toolNames.join(', ')}`,
      errorCode: LatitudeErrorCodes.UnprocessableEntityError,
      serverResponse: 'No response',
    })
  }

  const runArgs = {
    tools,
    toolRequests,
    conversationUuid,
    messages,
    instrumentation,
  }

  try {
    if (instrumentation && traceContext) {
      return await instrumentation.withTraceContext(traceContext, async () =>
        runHandlers(runArgs),
      )
    }

    return await runHandlers(runArgs)
  } catch (e) {
    if (e instanceof ToolExecutionPausedError) {
      return []
    }

    throw e
  }
}

type OriginalResponse = {
  uuid: string
  conversation: Message[]
  toolRequests: ToolCall[]
  response: ChainCallResponseDto
  agentResponse?: { response: string } | Record<string, unknown>
}

export function hasToolRequests<Tools extends ToolSpec>({
  response,
  tools,
}: {
  response: OriginalResponse
  tools: ToolCalledFn<Tools> | undefined
}) {
  const toolRequests =
    response.response.streamType === 'text' ? response.response.toolCalls : []

  return hasTools(tools) && toolRequests.length > 0
}

export async function handleToolRequests<
  Tools extends ToolSpec,
  T extends boolean,
>({
  chatFn,
  originalResponse,
  toolRequests,
  traceContext,
  instrumentation,
  ...options
}: ChatOptionsWithSDKOptions<Tools> & {
  originalResponse: OriginalResponse
  toolRequests: ToolCall[]
  chatFn: T extends false ? typeof syncChat : typeof streamChat
  traceContext?: TraceContext
  instrumentation?: ToolInstrumentation
}): Promise<ChatSyncAPIResponse | undefined> {
  const toolHandlers = options.tools!
  const toolResponseMessages = await buildToolResponseMessages({
    tools: toolHandlers,
    toolRequests,
    conversationUuid: originalResponse.uuid,
    messages: originalResponse.conversation,
    traceContext,
    instrumentation,
  })

  if (toolResponseMessages.length === 0) {
    options.onFinished?.(originalResponse)
    return originalResponse
  }

  return await chatFn(originalResponse.uuid, {
    ...options,
    messages: toolResponseMessages,
    // Note: do not pass the trace context recursively
    instrumentation,
  })
}
