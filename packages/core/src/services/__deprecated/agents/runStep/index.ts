import {
  AssistantMessage,
  Config,
  Conversation,
  Message,
  MessageRole,
} from '@latitude-data/compiler'
import {
  ABSOLUTE_MAX_STEPS,
  AGENT_RETURN_TOOL_NAME,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_CONFIG_NAME,
} from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ChainStreamManager } from '../../../../__deprecated/lib/chainStreamManager'
import {
  buildMessagesFromResponse,
  LogSources,
  Workspace,
} from '../../../../browser'
import { Result } from '../../../../lib/Result'
import { CachedApiKeys, stepLimitExceededErrorMessage } from '../../chains/run'
import { validateAgentStep, ValidatedAgentStep } from '../AgentStepValidator'

function inferStepsFromConversation(messages: Message[]): number {
  // Returns the count of assistant messages since the last agent response
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

export type StepProps = {
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
}: StepProps): Promise<{
  conversation: Conversation
}> {
  if (newMessages?.length) {
    const lastResponseMessage = newMessages[0]! as AssistantMessage
    const latitudeToolResponses =
      // Built-in tools are executed after client tools
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

  assertValidStepCount({ stepCount, step }).unwrap()

  const result = await chainStreamManager.getProviderResponse({
    source,
    conversation: step.conversation,
    provider: step.provider,
    schema: step.schema,
    output: step.output,
    injectAgentFinishTool: true,
    injectFakeAgentStartTool: !step.config.disableAgentOptimization,
    abortSignal,
  })

  // Pause the agent if response has client tool calls
  // Chain is not cached because there is no chain anymore
  if (result.clientToolCalls.length) {
    chainStreamManager.requestTools(result.clientToolCalls)
    return { conversation: step.conversation }
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
    // TODO(compiler)
    // @ts-expect-error - fix types
    newMessages: buildMessagesFromResponse({ response: result.response }),
    previousConfig: step.config,
    abortSignal,
  })
}
