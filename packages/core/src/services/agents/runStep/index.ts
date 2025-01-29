import {
  ContentType,
  Conversation,
  MessageRole,
  ToolMessage,
} from '@latitude-data/compiler'
import {
  buildMessagesFromResponse,
  LogSources,
  Workspace,
} from '../../../browser'
import { CachedApiKeys, stepLimitExceededErrorMessage } from '../../chains/run'
import {
  ABSOLUTE_MAX_STEPS,
  ChainStepResponse,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_CONFIG_NAME,
  StreamType,
} from '../../../constants'
import { Message } from '@latitude-data/compiler'
import { buildPrevContent, getToolCalls } from '../../chains/runStep'
import { ChainStreamConsumer } from '../../../lib/streamManager/ChainStreamConsumer'
import { validateAgentStep } from '../AgentStepValidator'
import { ChainError } from '../../../lib/streamManager/ChainErrors'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { streamAIResponse } from '../../../lib/streamManager'
import {
  executeBuiltInToolCall,
  getBuiltInToolCallsFromResponse,
} from '../../builtInTools'

export async function runAgentStep({
  workspace,
  source,
  conversation,
  providersMap,
  controller,
  previousCount: _previousCount = 0,
  previousResponse,
  errorableUuid,
  stepCount,
  extraMessages,
  builtinToolResponses,
}: {
  workspace: Workspace
  source: LogSources
  conversation: Conversation
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  errorableUuid: string
  previousCount?: number
  previousResponse: ChainStepResponse<StreamType>
  stepCount: number
  extraMessages?: Message[] // Contains tool responses when a stopped chain is resumed
  builtinToolResponses?: ToolMessage[]
}) {
  const { prevContent, previousCount } = buildPrevContent({
    previousResponse,
    extraMessages,
    previousCount: _previousCount,
    builtinToolResponses,
  })

  const streamConsumer = new ChainStreamConsumer({
    controller,
    previousCount,
    errorableUuid,
  })

  try {
    const step = await validateAgentStep({
      workspace,
      prevContent,
      conversation,
      providersMap,
    }).then((r) => r.unwrap())

    if (previousResponse && step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response: previousResponse,
        finishReason: 'stop',
      })

      return previousResponse
    }

    const maxSteps = Math.min(
      (conversation.config[MAX_STEPS_CONFIG_NAME] as number | undefined) ??
        DEFAULT_MAX_STEPS,
      ABSOLUTE_MAX_STEPS,
    )
    if (maxSteps && stepCount >= maxSteps) {
      throw new ChainError({
        message: stepLimitExceededErrorMessage(maxSteps),
        code: RunErrorCodes.MaxStepCountExceededError,
      })
    }

    const response = await streamAIResponse({
      workspace,
      controller,
      config: step.config,
      messages: step.conversation.messages,
      newMessagesCount: step.conversation.messages.length - previousCount,
      provider: step.provider,
      source,
      errorableUuid,
      chainCompleted: step.chainCompleted,
      schema: step.schema,
      output: step.output,
    })

    const toolCalls = getToolCalls({ response })
    const builtInToolCalls = getBuiltInToolCallsFromResponse(response)

    const clientToolCalls = toolCalls.filter(
      (toolCall) => !builtInToolCalls.some((b) => b.id === toolCall.id),
    )

    // Stop the chain if there are tool calls
    if (clientToolCalls.length) {
      streamConsumer.chainCompleted({
        step,
        response,
        finishReason: 'tool-calls',
        responseMessages: buildMessagesFromResponse({
          response,
        }),
      })

      return response
    }

    // Stop the chain if completed
    if (step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response,
        finishReason: response.finishReason ?? 'stop',
      })

      return response
    }

    const currentCount = step.conversation.messages.length
    builtinToolResponses = []
    await Promise.all(
      builtInToolCalls.map((toolCall) =>
        executeBuiltInToolCall(toolCall).then((result) => {
          builtinToolResponses!.push({
            role: MessageRole.tool,
            content: [
              {
                type: ContentType.toolResult,
                toolName: toolCall.name,
                toolCallId: toolCall.id,
                result: result.value ?? result.error?.message,
                isError: !result.ok,
              },
            ],
          })
        }),
      ),
    )

    return runAgentStep({
      workspace,
      source,
      conversation: step.conversation,
      errorableUuid,
      providersMap,
      controller,
      previousCount: currentCount,
      previousResponse: response,
      stepCount: stepCount + 1,
      builtinToolResponses,
    })
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
