import {
  AssistantMessage,
  type Conversation,
  type Message,
} from '@latitude-data/compiler'
import {
  ABSOLUTE_MAX_STEPS,
  ChainStepResponse,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_CONFIG_NAME,
  StreamType,
  TraceContext,
} from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Chain as PromptlChain } from 'promptl-ai'
import { buildMessagesFromResponse, Workspace } from '../../../browser'
import { LogSources } from '../../../constants'
import { ChainStreamManager } from '../../../lib/chainStreamManager'
import { telemetry, TelemetryContext } from '../../../telemetry'
import { cacheChain } from '../chainCache'
import {
  ConfigOverrides,
  validateChain,
  ValidatedChainStep,
} from '../ChainValidator'
import { CachedApiKeys, SomeChain, stepLimitExceededErrorMessage } from '../run'
import { Result } from './../../../lib/Result'

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
  context: TelemetryContext
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
  previousConfig: LatitudePromptConfig
  abortSignal?: AbortSignal
  previousResponse?: ChainStepResponse<StreamType>
  injectAgentFinishTool?: boolean
}

export async function runStep({
  context,
  workspace,
  chainStreamManager,
  previousConfig,
  previousResponse,
  // Contains all messages added from the end of the last step to the beginning of this one,
  // including the assistant response and tool results
  newMessages = undefined,
  chain,
  promptlVersion,
  providersMap,
  configOverrides,
  removeSchema,
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
        config: previousConfig,
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
  if (
    chain instanceof PromptlChain &&
    step.chainCompleted &&
    !!previousResponse // If no previous response has been generated, make an additional step
  ) {
    const trace = telemetry().pause(context)
    chainStreamManager.done(trace)
    return { conversation: step.conversation, trace }
  }

  const $step = telemetry().step(context)

  try {
    const result = executeStep({
      context: $step.context,
      workspace,
      chainStreamManager,
      previousConfig,
      previousResponse,
      newMessages,
      chain,
      promptlVersion,
      providersMap,
      configOverrides,
      removeSchema,
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

export async function executeStep({
  context,
  chainStreamManager,
  workspace,
  source,
  chain,
  promptlVersion,
  providersMap,
  errorableUuid,
  configOverrides,
  removeSchema,
  stepCount = 0,
  abortSignal,
  injectAgentFinishTool = false,
  step,
}: StepProps & {
  step: ValidatedChainStep
}): Promise<{
  conversation: Conversation
  trace: TraceContext
}> {
  assertValidStepCount({ stepCount, chain, step }).unwrap()

  const isAgent = step.conversation.config.type === 'agent'
  const enableAgentOptimization =
    !step.conversation.config.disableAgentOptimization
  const { response, clientToolCalls } =
    await chainStreamManager.getProviderResponse({
      context,
      source,
      conversation: step.conversation,
      provider: step.provider,
      schema: step.schema,
      output: step.output,
      abortSignal,
      injectFakeAgentStartTool:
        isAgent && injectAgentFinishTool && enableAgentOptimization,
      injectAgentFinishTool: isAgent && injectAgentFinishTool,
    })

  const isPromptl = chain instanceof PromptlChain
  const hasTools = isPromptl && clientToolCalls.length > 0

  // Pause the chain if response has client tool calls
  // Chain is cached because there is a running chain
  if (hasTools) {
    const trace = telemetry().pause(context)

    await cacheChain({
      workspace,
      chain,
      documentLogUuid: errorableUuid,
      previousResponse: response,
    })

    chainStreamManager.requestTools(clientToolCalls, trace)
    return { conversation: step.conversation, trace }
  }

  // With Legacy Compiler, we already knew whether the step was the last one BEFORE it was executed
  if (step.chainCompleted) {
    const trace = telemetry().pause(context)

    chainStreamManager.done(trace)
    return { conversation: step.conversation, trace }
  }

  // TODO(tracing): THE STEP SHOULD END HERE!!!!!!!!!

  // Note: pseudo pause the step so the recursion treats equally paused or previous steps
  context = telemetry().resume(telemetry().pause(context))

  return runStep({
    context,
    chainStreamManager,
    workspace,
    source,
    chain,
    promptlVersion,
    providersMap,
    errorableUuid,
    stepCount: stepCount + 1,
    newMessages: buildMessagesFromResponse({ response }),
    previousConfig: step.conversation.config as LatitudePromptConfig,
    configOverrides,
    removeSchema,
    abortSignal,
    previousResponse: response,
  })
}
