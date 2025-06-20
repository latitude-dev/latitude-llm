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
import {
  buildMessagesFromResponse,
  LogSources,
  TraceContext,
  Workspace,
} from '../../../browser'
import { ChainStreamManager } from '../../../lib/chainStreamManager'
import { telemetry, TelemetryContext } from '../../../telemetry'
import { CachedApiKeys, stepLimitExceededErrorMessage } from '../../chains/run'
import { validateAgentStep, ValidatedAgentStep } from '../AgentStepValidator'
import { Result } from './../../../lib/Result'

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
  context: TelemetryContext
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
  context,
  workspace,
  chainStreamManager,
  globalConfig,
  newMessages = undefined,
  conversation,
  providersMap,
  ...rest
}: StepProps): Promise<{
  conversation: Conversation
  trace: TraceContext
}> {
  if (newMessages?.length) {
    const lastResponseMessage = newMessages[0]! as AssistantMessage
    const latitudeToolResponses =
      // Built-in tools are executed after client tools
      await chainStreamManager.handleBuiltInToolCalls({
        context: context, // Note: context from previous (maybe paused) step
        message: lastResponseMessage,
        config: globalConfig,
      })
    newMessages = [
      lastResponseMessage,
      ...latitudeToolResponses,
      ...newMessages.slice(1),
    ]
  }

  // Note: incoming context could be from a paused or previous
  // step, so we need to restore the original context
  if (!telemetry().restored(context)) {
    context = telemetry().restore(context)
  }

  const step = await validateAgentStep({
    workspace,
    conversation,
    newMessages,
    providersMap,
  }).then((r) => r.unwrap())

  if (step.chainCompleted) {
    const trace = telemetry().pause(context)

    chainStreamManager.done(trace)
    return { conversation: step.conversation, trace }
  }

  const $step = telemetry().step(context)

  try {
    const result = executeAgentStep({
      context: $step.context,
      workspace,
      chainStreamManager,
      globalConfig,
      newMessages,
      conversation,
      providersMap,
      step,
      ...rest,
    })

    result.then(() => $step.end()).catch((error) => $step.fail(error))

    return result
  } catch (error) {
    $step.fail(error as Error)
    throw error
  }
}

async function executeAgentStep({
  context,
  chainStreamManager,
  workspace,
  source,
  providersMap,
  errorableUuid,
  globalConfig,
  stepCount,
  abortSignal,
  step,
}: StepProps & {
  step: ValidatedAgentStep
}): Promise<{
  conversation: Conversation
  trace: TraceContext
}> {
  assertValidStepCount({ stepCount, step }).unwrap()

  const { response, clientToolCalls } =
    await chainStreamManager.getProviderResponse({
      context,
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
  if (clientToolCalls.length) {
    const trace = telemetry().pause(context)

    chainStreamManager.requestTools(clientToolCalls, trace)
    return { conversation: step.conversation, trace }
  }

  // TODO(tracing): THE STEP SHOULD END HERE!!!!!!!!!

  // Note: pseudo pause the step so the recursion treats equally paused or previous steps
  context = telemetry().resume(telemetry().pause(context))

  return runAgentStep({
    context,
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
