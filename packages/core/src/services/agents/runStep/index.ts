import { Conversation } from '@latitude-data/compiler'
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
import { cacheChain } from '../../chains/chainCache'
import { Chain } from 'promptl-ai'

export async function runAgentStep({
  workspace,
  source,
  originalChain,
  conversation,
  providersMap,
  controller,
  previousCount: _previousCount = 0,
  previousResponse,
  errorableUuid,
  stepCount,
  extraMessages,
}: {
  workspace: Workspace
  source: LogSources
  conversation: Conversation
  originalChain: Chain
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  errorableUuid: string
  previousCount?: number
  previousResponse: ChainStepResponse<StreamType>
  stepCount: number
  extraMessages?: Message[] // Contains tool responses when a stopped chain is resumed
}) {
  const { prevContent, previousCount } = buildPrevContent({
    previousResponse,
    extraMessages,
    previousCount: _previousCount,
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

    // Stop the chain if there are tool calls
    if (toolCalls.length) {
      await cacheChain({
        workspace,
        chain: originalChain as Chain,
        documentLogUuid: errorableUuid,
        previousResponse: response,
      })

      streamConsumer.chainCompleted({
        step,
        response,
        finishReason: 'tool-calls',
        responseMessages: buildMessagesFromResponse({
          response,
        }),
      })
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

    return runAgentStep({
      workspace,
      source,
      originalChain,
      conversation: step.conversation,
      errorableUuid,
      providersMap,
      controller,
      previousCount: step.conversation.messages.length,
      previousResponse: response,
      stepCount: stepCount + 1,
    })
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
