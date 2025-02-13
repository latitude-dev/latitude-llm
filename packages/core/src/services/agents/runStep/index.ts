import { AssistantMessage, Conversation } from '@latitude-data/compiler'
import {
  buildMessagesFromResponse,
  LogSources,
  Workspace,
} from '../../../browser'
import { CachedApiKeys, stepLimitExceededErrorMessage } from '../../chains/run'
import {
  ABSOLUTE_MAX_STEPS,
  AGENT_RETURN_TOOL_NAME,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_CONFIG_NAME,
} from '../../../constants'
import { Message } from '@latitude-data/compiler'
import { getBuiltInToolCallsFromAssistantMessage } from '../../builtInTools'
import { getToolCalls, handleLatitudeTools } from '../../chains/runStep'
import { validateAgentStep, ValidatedAgentStep } from '../AgentStepValidator'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { ChainStreamManager } from '../../../lib/chainStreamManager'
import { Result } from '../../../lib'

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
  const exceededMaxSteps = stepCount >= maxSteps
  if (!exceededMaxSteps) return Result.nil()

  return Result.error(
    new ChainError({
      message: stepLimitExceededErrorMessage(maxSteps),
      code: RunErrorCodes.MaxStepCountExceededError,
    }),
  )
}

export async function runAgentStep({
  chainStreamManager,
  workspace,
  source,
  conversation,
  providersMap,
  errorableUuid,
  newMessages = undefined,
  stepCount,
}: {
  chainStreamManager: ChainStreamManager
  workspace: Workspace
  source: LogSources
  conversation: Conversation
  providersMap: CachedApiKeys
  errorableUuid: string
  newMessages: Message[] | undefined
  stepCount: number
}) {
  await handleLatitudeTools({ chainStreamManager, newMessages })

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

  const response = await chainStreamManager.getProviderResponse({
    workspace,
    source,
    documentLogUuid: errorableUuid,
    conversation: step.conversation,
    provider: step.provider,
    schema: step.schema,
    output: step.output,
  })

  const toolCalls = getToolCalls({ response }).filter(
    (tc) => tc.name !== AGENT_RETURN_TOOL_NAME,
  )
  const [responseMessage] = buildMessagesFromResponse({ response }) as [
    AssistantMessage,
  ]
  const builtInToolCalls = getBuiltInToolCallsFromAssistantMessage(
    responseMessage as AssistantMessage,
  )
  const clientToolCalls = toolCalls.filter(
    (toolCall) => !builtInToolCalls.some((b) => b.id === toolCall.id),
  )

  // Stop the chain if there are tool calls
  if (clientToolCalls.length) {
    chainStreamManager.requestTools(clientToolCalls)
    return
  }

  return runAgentStep({
    chainStreamManager,
    workspace,
    source,
    conversation: step.conversation,
    errorableUuid,
    providersMap,
    stepCount: stepCount + 1,
    newMessages: [responseMessage],
  })
}
