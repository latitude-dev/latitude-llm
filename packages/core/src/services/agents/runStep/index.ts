import {
  AssistantMessage,
  Config,
  Conversation,
  MessageRole,
} from '@latitude-data/compiler'
import {
  buildMessagesFromResponse,
  LogSources,
  Workspace,
} from '../../../browser'
import { CachedApiKeys, stepLimitExceededErrorMessage } from '../../chains/run'
import { Message } from '@latitude-data/compiler'
import { validateAgentStep, ValidatedAgentStep } from '../AgentStepValidator'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { ChainStreamManager } from '../../../lib/chainStreamManager'
import {
  ABSOLUTE_MAX_STEPS,
  AGENT_RETURN_TOOL_NAME,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_CONFIG_NAME,
} from '@latitude-data/constants'
import { Result } from './../../../lib/Result'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

function inferStepsFromConversation(messages: Message[]): number {
  // Returns the count of assistant messages since the last AGENT_RESPONST tool request
  const lastAgentResponseInverseIndex = messages
    .slice()
    .reverse()
    .findIndex(
      (message) =>
        message.role === MessageRole.assistant &&
        message.toolCalls?.some(
          (toolCall) => toolCall.name === AGENT_RETURN_TOOL_NAME,
        ),
    )

  const messagesSinceLastAgentResponse =
    lastAgentResponseInverseIndex === -1
      ? messages
      : messages.slice(messages.length - lastAgentResponseInverseIndex)

  const assistantMessagesSinceLastAgentResponse =
    messagesSinceLastAgentResponse.filter(
      (message) => message.role === MessageRole.assistant,
    )

  return assistantMessagesSinceLastAgentResponse.length
}

function assertValidStepCount({
  stepCount,
  step,
}: {
  stepCount: number
  step: ValidatedAgentStep
}) {
  const maxSteps = Math.min(
    (step.conversation.config[MAX_STEPS_CONFIG_NAME] as number | undefined) ??
      DEFAULT_MAX_STEPS,
    ABSOLUTE_MAX_STEPS,
  )

  if (stepCount >= maxSteps) {
    return Result.error(
      new ChainError({
        message: stepLimitExceededErrorMessage(maxSteps),
        code: RunErrorCodes.MaxStepCountExceededError,
      }),
    )
  }

  const inferredSteps = inferStepsFromConversation(step.conversation.messages)
  if (inferredSteps >= maxSteps) {
    return Result.error(
      new ChainError({
        message: stepLimitExceededErrorMessage(maxSteps),
        code: RunErrorCodes.MaxStepCountExceededError,
      }),
    )
  }

  return Result.nil()
}

export async function runAgentStep({
  chainStreamManager,
  workspace,
  source,
  conversation,
  providersMap,
  errorableUuid,
  globalConfig,
  newMessages = undefined,
  stepCount,
  abortSignal,
}: {
  chainStreamManager: ChainStreamManager
  workspace: Workspace
  source: LogSources
  conversation: Conversation
  providersMap: CachedApiKeys
  errorableUuid: string
  newMessages: Message[] | undefined
  globalConfig: LatitudePromptConfig
  previousConfig: Config
  stepCount: number
  abortSignal?: AbortSignal
}) {
  if (newMessages?.length) {
    const lastResponseMessage = newMessages[0]! as AssistantMessage
    const latitudeToolResponses =
      await chainStreamManager.handleBuiltInToolCalls({
        message: lastResponseMessage,
        config: globalConfig,
      })
    newMessages = [
      lastResponseMessage,
      ...latitudeToolResponses,
      ...newMessages.slice(1),
    ]
  }

  const step = await validateAgentStep({
    workspace,
    conversation,
    newMessages,
    providersMap,
  }).then((r) => r.unwrap())

  if (step.chainCompleted) {
    chainStreamManager.done()
    return
  }

  const validStepCount = assertValidStepCount({ stepCount, step })
  if (validStepCount.error) {
    chainStreamManager.error(validStepCount.error)
    return
  }

  const { response, clientToolCalls } =
    await chainStreamManager.getProviderResponse({
      source,
      conversation: step.conversation,
      provider: step.provider,
      schema: step.schema,
      output: step.output,
      injectAgentFinishTool: true,
      injectFakeAgentStartTool: !step.config.disableAgentOptimization,
      abortSignal,
    })

  // Stop the chain if there are tool calls
  if (clientToolCalls.length) {
    chainStreamManager.requestTools(clientToolCalls)
    return
  }

  return runAgentStep({
    chainStreamManager,
    workspace,
    source,
    globalConfig,
    conversation: step.conversation,
    errorableUuid,
    providersMap,
    stepCount: stepCount + 1,
    newMessages: buildMessagesFromResponse({ response }),
    previousConfig: step.config,
    abortSignal,
  })
}
