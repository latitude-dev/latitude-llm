import { LogSources } from '@latitude-data/constants'
import { mergeCostBreakdown } from '@latitude-data/constants/costs'
import { Message } from '@latitude-data/constants/messages'
import {
  MAX_SIMULATION_TURNS,
  SimulationSettings,
} from '@latitude-data/constants/simulation'
import { RedisStream } from '../../../../lib/redisStream'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import { incrementTokens } from '../../../../lib/streamManager'
import { WorkspaceDto } from '../../../../schema/models/types/Workspace'
import { addMessages } from '../../../../services/addMessages'
import { ToolHandler } from '../../../../services/documents/tools/clientTools/handlers'
import { generateSimulatedUserAction } from '../../../../services/simulation/simulateUserResponse'
import { captureException } from '../../../../utils/datadogCapture'
import { forwardStreamEvents } from './streamManagement'
import { LanguageModelUsageType, RunIdentifiers, RunMetrics } from './types'

/**
 * Determines if multi-turn simulation should be run based on the simulation settings
 */
export function shouldRunMultiTurnSimulation(
  simulationSettings?: SimulationSettings,
): simulationSettings is SimulationSettings {
  return Boolean(
    simulationSettings?.maxTurns && simulationSettings.maxTurns > 1,
  )
}

/**
 * Calculates the effective max turns, capped at MAX_SIMULATION_TURNS
 */
function calculateMaxTurns(requestedMaxTurns: number | undefined): number {
  return Math.min(requestedMaxTurns ?? 1, MAX_SIMULATION_TURNS)
}

type ExecuteSingleTurnArgs = RunIdentifiers & {
  messages: Message[]
  currentTurn: number
  maxTurns: number
  simulationInstructions?: string
  simulationSettings?: SimulationSettings
  workspace: WorkspaceDto
  documentLogUuid: string
  tools: Record<string, ToolHandler>
  mcpHeaders?: Record<string, Record<string, string>>
  abortSignal?: AbortSignal
  writeStream: RedisStream
}

type TurnResult = {
  shouldContinue: boolean
  messages: Message[]
  metrics: RunMetrics
}

/**
 * Executes a single turn of the simulated conversation.
 *
 * The simulated user first evaluates the assistant's response and decides:
 * - "end": Stop the conversation (returns shouldContinue: false without sending a message)
 * - "respond": Continue with the generated message, then get the assistant's reply
 */
async function executeSingleTurn({
  simulationInstructions,
  simulationSettings,
  currentTurn,
  maxTurns,
  messages,
  workspace,
  documentLogUuid,
  tools,
  mcpHeaders,
  abortSignal,
  writeStream,
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
}: ExecuteSingleTurnArgs): PromisedResult<TurnResult, Error> {
  const userActionResult = await generateSimulatedUserAction({
    messages,
    simulationInstructions,
    currentTurn,
    maxTurns,
    abortSignal,
  })

  if (!Result.isOk(userActionResult)) {
    captureException(userActionResult.error)
    return userActionResult
  }

  const userAction = userActionResult.value

  const emptyMetrics: RunMetrics = {
    runUsage: {
      inputTokens: 0,
      outputTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    runCost: {},
    duration: 0,
  }

  if (userAction.action === 'end') {
    return Result.ok({ shouldContinue: false, messages, metrics: emptyMetrics })
  }

  const addMessagesResult = await addMessages({
    workspace,
    documentLogUuid,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userAction.message }],
      },
    ],
    source: LogSources.API,
    tools,
    mcpHeaders,
    abortSignal,
    simulationSettings,
  })

  if (!Result.isOk(addMessagesResult)) {
    captureException(addMessagesResult.error)
    return addMessagesResult
  }

  const result = addMessagesResult.unwrap()

  await forwardStreamEvents({
    workspaceId,
    projectId,
    documentUuid,
    commitUuid,
    runUuid,
    writeStream,
    readStream: result.stream,
  })

  const [updatedMessages, runUsage, runCost, duration] = await Promise.all([
    result.messages,
    result.runUsage,
    result.runCost,
    result.duration,
  ])

  return Result.ok({
    shouldContinue: true,
    messages: updatedMessages,
    metrics: { runUsage, runCost, duration },
  })
}

type SimulateUserResponsesArgs = RunIdentifiers & {
  initialMessages: Message[]
  workspace: WorkspaceDto
  documentLogUuid: string
  simulationSettings: SimulationSettings
  tools: Record<string, ToolHandler>
  mcpHeaders?: Record<string, Record<string, string>>
  abortSignal?: AbortSignal
  writeStream: RedisStream
}

/**
 * Simulates multi-turn conversations by generating user responses
 * and continuing the conversation until maxTurns is reached or
 * the conversation naturally ends.
 *
 * Each turn:
 * 1. Generates a simulated user response based on conversation context
 * 2. Sends the response to the document and gets the assistant's reply
 * 3. Forwards the stream events to Redis for client consumption
 *
 * Returns aggregated metrics from all simulation turns.
 */
export async function simulateUserResponses({
  initialMessages,
  workspace,
  documentLogUuid,
  simulationSettings,
  tools,
  mcpHeaders,
  abortSignal,
  writeStream,
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
}: SimulateUserResponsesArgs): PromisedResult<RunMetrics, Error> {
  const emptyMetrics: RunMetrics = {
    runUsage: {
      inputTokens: 0,
      outputTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    runCost: {},
    duration: 0,
  }

  if (!shouldRunMultiTurnSimulation(simulationSettings)) {
    return Result.ok(emptyMetrics)
  }

  const maxTurns = calculateMaxTurns(simulationSettings.maxTurns)
  if (maxTurns <= 1) return Result.ok(emptyMetrics)

  let messages: Message[] = initialMessages
  let currentTurn = 2
  let aggregatedMetrics: RunMetrics = { ...emptyMetrics }

  while (currentTurn <= maxTurns) {
    if (abortSignal?.aborted) break

    const turnResult = await executeSingleTurn({
      simulationInstructions: simulationSettings.simulatedUserGoal,
      simulationSettings,
      currentTurn,
      maxTurns,
      messages,
      workspace,
      documentLogUuid,
      tools,
      mcpHeaders,
      abortSignal,
      writeStream,
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
    })

    if (!Result.isOk(turnResult)) return turnResult

    const {
      shouldContinue,
      messages: updatedMessages,
      metrics,
    } = turnResult.unwrap()

    aggregatedMetrics = {
      runUsage: incrementTokens({
        prev: aggregatedMetrics.runUsage as LanguageModelUsageType,
        next: metrics.runUsage as LanguageModelUsageType,
      }),
      runCost: mergeCostBreakdown(aggregatedMetrics.runCost, metrics.runCost),
      duration: aggregatedMetrics.duration + metrics.duration,
    }

    if (!shouldContinue) break

    messages = updatedMessages
    currentTurn++
  }

  return Result.ok(aggregatedMetrics)
}
