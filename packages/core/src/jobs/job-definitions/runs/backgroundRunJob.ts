import { ChainEventTypes, LogSources } from '@latitude-data/constants'
import { Job } from 'bullmq'
import { publisher } from '../../../events/publisher'
import { RedisStream } from '../../../lib/redisStream'
import { Result } from '../../../lib/Result'
import { incrementTokens } from '../../../lib/streamManager'
import { Experiment } from '../../../schema/models/types/Experiment'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { buildClientToolHandlersMap } from '../../../services/documents/tools/clientTools/handlers'
import { endRun } from '../../../services/runs/end'
import { startRun } from '../../../services/runs/start'
import { BACKGROUND } from '../../../telemetry'
import { captureException } from '../../../utils/datadogCapture'
import { getJobDocumentData } from '../helpers'
import {
  fetchExperiment,
  handleExperimentSuccess,
  markExperimentFailure,
} from './helpers/experimentHandler'
import {
  shouldRunMultiTurnSimulation,
  simulateUserResponses,
} from './helpers/multiTurnSimulation'
import {
  createCancelHandler,
  createWriteStream,
  forwardStreamEvents,
} from './helpers/streamManagement'
import {
  BackgroundRunJobData,
  BackgroundRunJobResult,
  RunMetrics,
} from './helpers/types'

export type { BackgroundRunJobData, BackgroundRunJobResult, RunMetrics }

type CleanupResourcesArgs = {
  writeStream: RedisStream
  cancelJob: (args: { jobId: string }) => void
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
  metrics?: RunMetrics
  experimentId?: number
}

async function cleanupResources({
  writeStream,
  cancelJob,
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
  metrics,
  experimentId,
}: CleanupResourcesArgs) {
  await writeStream.close().catch(() => {})
  await writeStream.cleanup()
  await publisher.unsubscribe('cancelJob', cancelJob)

  try {
    const endResult = await endRun({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      metrics,
      experimentId,
    })
    if (!Result.isOk(endResult)) {
      captureException(new Error(`[BackgroundRunJob] Failed to end run`))
    }
  } catch (_error) {
    captureException(new Error(`[BackgroundRunJob] Failed to end run`))
  }
}

function aggregateMetrics(iterations: RunMetrics[]): RunMetrics {
  return iterations.reduce(
    (acc, curr) => ({
      runUsage: incrementTokens({ prev: acc.runUsage, next: curr.runUsage }),
      runCost: acc.runCost + curr.runCost,
      duration: acc.duration + curr.duration,
    }),
    {
      runUsage: {
        inputTokens: 0,
        outputTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      runCost: 0,
      duration: 0,
    },
  )
}

/**
 * Background job that executes a document run asynchronously.
 *
 * This job handles:
 * 1. Fetching the document and workspace data
 * 2. Starting the run and subscribing to cancellation events
 * 3. Executing the document with the provided parameters
 * 4. Forwarding stream events to Redis for client consumption
 * 5. Running multi-turn simulations if configured
 * 6. Handling experiment success/failure tracking
 * 7. Cleaning up resources (streams, subscriptions)
 */
export const backgroundRunJob = async (
  job: Job<BackgroundRunJobData, BackgroundRunJobResult>,
) => {
  const {
    workspaceId,
    projectId,
    commitUuid,
    documentUuid,
    experimentId,
    datasetRowId,
    runUuid,
    parameters = {},
    customIdentifier,
    tools = [],
    mcpHeaders,
    userMessage,
    messages,
    source = LogSources.API,
    simulationSettings,
    activeDeploymentTest,
  } = job.data

  const writeStream = createWriteStream(runUuid)
  const abortController = new AbortController()
  const cancelJob = createCancelHandler(job.id, abortController)

  let experiment: Experiment | undefined = undefined
  const metricsIterations: RunMetrics[] = []

  try {
    const { workspace, document, commit } = await getJobDocumentData({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    experiment = await fetchExperiment({ workspaceId, experimentId })

    if (experiment?.finishedAt) {
      return
    }

    await startRun({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      activeDeploymentTest,
      parameters,
      customIdentifier,
      tools,
      userMessage,
    }).then((r) => r.unwrap())

    publisher.subscribe('cancelJob', cancelJob)

    const result = await runDocumentAtCommit({
      workspace,
      document,
      commit,
      errorableUuid: runUuid,
      parameters,
      customIdentifier,
      experiment,
      source,
      customPrompt: experiment?.metadata?.prompt,
      abortSignal: abortController.signal,
      context: BACKGROUND({ workspaceId }),
      tools: buildClientToolHandlersMap(tools),
      mcpHeaders,
      userMessage,
      messages,
      simulationSettings,
    }).then((r) => r.unwrap())

    await forwardStreamEvents({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      writeStream,
      readStream: result.stream,
    })

    const [initialRunUsage, initialRunCost, initialDuration] =
      await Promise.all([result.runUsage, result.runCost, result.duration])

    metricsIterations.push({
      runUsage: initialRunUsage,
      runCost: initialRunCost,
      duration: initialDuration,
    })

    if (shouldRunMultiTurnSimulation(simulationSettings)) {
      const simulationMetrics = await simulateUserResponses({
        workspace,
        documentLogUuid: result.uuid,
        simulationSettings,
        tools: buildClientToolHandlersMap(tools),
        mcpHeaders,
        abortSignal: abortController.signal,
        writeStream,
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
        runUuid,
        initialMessages: await result.conversation.messages,
      }).then((r) => r.unwrap())

      metricsIterations.push(simulationMetrics)
    }

    if (experiment) {
      await handleExperimentSuccess({
        experiment,
        workspaceId,
        workspace,
        runUuid,
        conversationUuid: result.uuid,
        datasetRowId,
      }).then((r) => r.unwrap())
    }
  } catch (error) {
    writeStream.write({ type: ChainEventTypes.ChainError, data: error })

    if (experiment) {
      await markExperimentFailure({
        workspaceId,
        experiment,
        runUuid,
      })
    }

    captureException(error as Error)
  } finally {
    const aggregatedMetrics =
      metricsIterations.length > 0
        ? aggregateMetrics(metricsIterations)
        : undefined

    await cleanupResources({
      writeStream,
      cancelJob,
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      metrics: aggregatedMetrics,
      experimentId,
    })
  }
}
