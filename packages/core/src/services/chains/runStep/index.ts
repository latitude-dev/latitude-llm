import { Chain as PromptlChain } from 'promptl-ai'
import { AssistantMessage, type Message } from '@latitude-data/compiler'
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
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { buildMessagesFromResponse, Workspace } from '../../../browser'
import { ChainStepResponse, StreamType } from '../../../constants'
import { cacheChain } from '../chainCache'
import { ChainStreamManager } from '../../../lib/chainStreamManager'
import { getBuiltInToolCallsFromAssistantMessage } from '../../builtInTools'

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

export async function handleLatitudeTools({
  chainStreamManager,
  newMessages,
}: {
  chainStreamManager: ChainStreamManager
  newMessages: Message[] | undefined
}) {
  if (!newMessages?.length) return

  const lastResponse = newMessages[0]! as AssistantMessage
  const builtInToolCalls = getBuiltInToolCallsFromAssistantMessage(lastResponse)
  const latitudeToolResponses =
    await chainStreamManager.executeLatitudeTools(builtInToolCalls)
  newMessages.push(...latitudeToolResponses)
}

function assertValidStepCount({
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

  if (!exceededMaxSteps) return Result.nil()

  return Result.error(
    new ChainError({
      message: stepLimitExceededErrorMessage(maxSteps),
      code: RunErrorCodes.MaxStepCountExceededError,
    }),
  )
}

export type StepProps = {
  chainStreamManager: ChainStreamManager
  workspace: Workspace
  source: LogSources
  chain: SomeChain
  promptlVersion: number
  providersMap: CachedApiKeys
  errorableUuid: string
  newMessages: Message[] | undefined
  configOverrides?: ConfigOverrides
  removeSchema?: boolean
  stepCount?: number
}

export async function runStep({
  chainStreamManager,
  workspace,
  source,
  chain,
  promptlVersion,
  providersMap,
  errorableUuid,
  // Contains all messages added from the end of the last step to the beginning of this one,
  // including the assistant response and tool results
  newMessages = undefined,
  configOverrides,
  removeSchema,
  stepCount = 0,
}: StepProps) {
  await handleLatitudeTools({ chainStreamManager, newMessages })

  const step = await validateChain({
    workspace,
    newMessages,
    chain,
    promptlVersion,
    providersMap,
    configOverrides,
    removeSchema,
  }).then((r) => r.unwrap())

  // With PromptL, the chain complete is checked AFTER the step is executed.
  // If the chain is completed, no more steps must be ran.
  if (chain instanceof PromptlChain && step.chainCompleted) {
    chainStreamManager.done()
    return step.conversation
  }

  const validStepCount = assertValidStepCount({ stepCount, chain, step })

  if (validStepCount.error) {
    chainStreamManager.error(validStepCount.error)
    return step.conversation
  }

  const response = await chainStreamManager.getProviderResponse({
    workspace,
    source,
    documentLogUuid: errorableUuid,
    conversation: step.conversation,
    provider: step.provider,
    schema: step.schema,
    output: step.output,
  })

  const isPromptl = chain instanceof PromptlChain
  const toolCalls = getToolCalls({ response })

  const [responseMessage] = buildMessagesFromResponse({ response }) as [
    AssistantMessage,
  ]
  const builtInToolCalls = getBuiltInToolCallsFromAssistantMessage(
    responseMessage as AssistantMessage,
  )
  const clientToolCalls = toolCalls.filter(
    (toolCall) => !builtInToolCalls.some((b) => b.id === toolCall.id),
  )

  const hasTools = isPromptl && clientToolCalls.length > 0

  // If response has tools, we must cache and stop the chain
  if (hasTools) {
    await cacheChain({
      workspace,
      chain,
      documentLogUuid: errorableUuid,
      previousResponse: response,
    })

    chainStreamManager.requestTools(clientToolCalls)
    return step.conversation
  }

  // With Legacy Compiler, we already knew whether the step was the last one BEFORE it was executed
  if (step.chainCompleted) {
    chainStreamManager.done()
    return step.conversation
  }

  return runStep({
    chainStreamManager,
    workspace,
    source,
    chain,
    promptlVersion,
    providersMap,
    errorableUuid,
    stepCount: stepCount + 1,
    newMessages: [responseMessage],
    configOverrides,
    removeSchema,
  })
}
