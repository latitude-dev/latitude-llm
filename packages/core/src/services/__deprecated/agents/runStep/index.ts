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
  TraceContext,
  Workspace,
} from '../../../../browser'
import { Result } from '../../../../lib/Result'
import { telemetry, TelemetryContext } from '../../../../telemetry'
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
  trace: TraceContext
}> {
  let trace = telemetry.pause(context)

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
  if (!telemetry.restored(context)) {
    context = telemetry.restore(context)
    trace = telemetry.pause(context)
  }

  const step = await validateAgentStep({
    workspace,
    conversation,
    newMessages,
    providersMap,
  }).then((r) => r.unwrap())

  if (step.chainCompleted) {
    chainStreamManager.done(trace)
    return { conversation: step.conversation, trace }
  }

  const $step = telemetry.step(context)
  context = $step.context
  trace = telemetry.pause(context)

  let result
  try {
    assertValidStepCount({ stepCount, step }).unwrap()

    result = await chainStreamManager.getProviderResponse({
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

    $step.end()
  } catch (error) {
    $step.fail(error as Error)
    throw error
  }

  // Pause the agent if response has client tool calls
  // Chain is not cached because there is no chain anymore
  if (result.clientToolCalls.length) {
    chainStreamManager.requestTools(result.clientToolCalls, trace)
    return { conversation: step.conversation, trace }
  }

  return runAgentStep({
    context: telemetry.resume(trace), // Note: pseudo resume the step so the recursion treats equally paused or previous steps
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
