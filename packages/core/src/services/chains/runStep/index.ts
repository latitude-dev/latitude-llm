import { Chain as PromptlChain } from 'promptl-ai'
import type { Message } from '@latitude-data/compiler'
import {
  ABSOLUTE_MAX_STEPS,
  DEFAULT_MAX_STEPS,
  LogSources,
  MAX_STEPS_CONFIG_NAME,
} from '../../../constants'
import {
  ConfigOverrides,
  validateChain,
  ValidatedChainStep,
} from '../ChainValidator'
import { CachedApiKeys, SomeChain, stepLimitExceededErrorMessage } from '../run'
import { Result } from '../../../lib'
import { ChainError } from '../../../lib/streamManager/ChainErrors'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { buildMessagesFromResponse, Workspace } from '../../../browser'
import { ChainStepResponse, StreamType } from '../../../constants'
import { ChainStreamConsumer } from '../../../lib/streamManager/ChainStreamConsumer'
import { streamAIResponse } from '../../../lib/streamManager'
import { cacheChain } from '../chainCache'

export function getToolCalls({
  response,
}: {
  response: ChainStepResponse<StreamType>
}) {
  const type = response.streamType
  if (type === 'object') return []

  const toolCalls = response.toolCalls ?? []

  return toolCalls
}

function getNextStepCount({
  stepCount,
  chain,
  step,
}: {
  stepCount: number
  chain: SomeChain
  step: ValidatedChainStep
}) {
  const maxSteps = Math.min(
    (step.conversation.config[MAX_STEPS_CONFIG_NAME] as number | undefined) ??
      DEFAULT_MAX_STEPS,
    ABSOLUTE_MAX_STEPS,
  )
  const exceededMaxSteps =
    chain instanceof PromptlChain ? stepCount >= maxSteps : stepCount > maxSteps

  if (!exceededMaxSteps) return Result.ok(++stepCount)

  return Result.error(
    new ChainError({
      message: stepLimitExceededErrorMessage(maxSteps),
      code: RunErrorCodes.MaxStepCountExceededError,
    }),
  )
}

export type StepProps = {
  workspace: Workspace
  source: LogSources
  chain: SomeChain
  promptlVersion: number
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  errorableUuid: string
  previousCount?: number
  previousResponse?: ChainStepResponse<StreamType>
  removeSchema?: boolean
  stepCount?: number
  extraMessages?: Message[]
  configOverrides?: ConfigOverrides
}

export function buildPrevContent({
  previousResponse,
  extraMessages,
  previousCount,
}: {
  previousResponse: StepProps['previousResponse']
  extraMessages: StepProps['extraMessages']
  previousCount: number
}) {
  if (!previousResponse) return { prevContent: undefined, previousCount }
  if (!extraMessages) {
    return {
      prevContent: previousResponse.text,
      previousCount: previousCount + 1,
    }
  }

  const prevContent = buildMessagesFromResponse({
    response: previousResponse,
  }).concat(...extraMessages)
  return { prevContent, previousCount: previousCount + prevContent.length }
}

export async function runStep(stepProps: StepProps) {
  const {
    workspace,
    source,
    chain,
    promptlVersion,
    providersMap,
    controller,
    previousCount: _previousCount = 0,
    previousResponse,
    errorableUuid,
    configOverrides,
    removeSchema,
    extraMessages, // Contains tool responses when a stopped chain is resumed
    stepCount = 0,
  } = stepProps

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
    const step = await validateChain({
      workspace,
      prevContent,
      chain,
      promptlVersion,
      providersMap,
      configOverrides,
      removeSchema,
    }).then((r) => r.unwrap())

    // With PromptL, the chain complete is checked AFTER the step is executed.
    // If the chain is completed, no more steps must be ran.
    if (chain instanceof PromptlChain && step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response: previousResponse!,
        finishReason: previousResponse?.finishReason ?? 'stop',
      })

      previousResponse!.chainCompleted = true
      return previousResponse!
    }

    const nextStepCount = getNextStepCount({ stepCount, chain, step }).unwrap()

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

    const isPromptl = chain instanceof PromptlChain
    const toolCalls = getToolCalls({ response })
    const hasTools = isPromptl && toolCalls.length > 0

    // If response has tools, we must cache and stop the chain
    if (hasTools) {
      await cacheChain({
        workspace,
        chain,
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

      return {
        ...response,
        finishReason: 'tool-calls',
        chainCompleted: step.chainCompleted,
      } as ChainStepResponse<StreamType>
    }

    // With Legacy Compiler, we already knew whether the step was the last one BEFORE it was executed
    if (step.chainCompleted) {
      const finishReason = response.finishReason ?? 'stop'

      streamConsumer.chainCompleted({
        step,
        response,
        finishReason,
        responseMessages: buildMessagesFromResponse({
          response,
        }),
      })

      return {
        ...response,
        finishReason,
        chainCompleted: step.chainCompleted,
      } as ChainStepResponse<StreamType>
    }

    return runStep({
      ...stepProps,
      previousResponse: response,
      previousCount: step.conversation.messages.length,
      stepCount: nextStepCount,
      extraMessages: undefined,
    })
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
