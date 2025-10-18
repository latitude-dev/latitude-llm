import { ChainEventTypes, LogSources } from '@latitude-data/constants'
import { Job } from 'bullmq'
import { publisher } from '../../../events/publisher'
import { RedisStream } from '../../../lib/redisStream'
import { Result } from '../../../lib/Result'
import { buildClientToolHandlersMap } from '../../../services/documents/tools/clientTools/handlers'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { startRun } from '../../../services/runs/start'
import { endRun } from '../../../services/runs/end'
import { BACKGROUND } from '../../../telemetry'
import { getJobDocumentData } from '../helpers'
import { Experiment } from '../../../schema/models/types/Experiment'
import { captureException } from '../../../utils/datadogCapture'
import {
  fetchExperiment,
  handleExperimentSuccess,
  markExperimentFailure,
} from './helpers/experimentHandler'
import {
  createCancelHandler,
  createWriteStream,
  forwardStreamEvents,
} from './helpers/streamManagement'
import {
  shouldRunMultiTurnSimulation,
  simulateUserResponses,
} from './helpers/multiTurnSimulation'
import { BackgroundRunJobData, BackgroundRunJobResult } from './helpers/types'

export type { BackgroundRunJobData, BackgroundRunJobResult }

type CleanupResourcesArgs = {
  writeStream: RedisStream
  cancelJob: (args: { jobId: string }) => void
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
}

async function cleanupResources({
  writeStream,
  cancelJob,
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
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
    })
    if (!Result.isOk(endResult)) {
      captureException(new Error(`[BackgroundRunJob] Failed to end run`))
    }
  } catch (_error) {
    captureException(new Error(`[BackgroundRunJob] Failed to end run`))
  }
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
    source = LogSources.API,
    simulationSettings,
    activeDeploymentTest,
  } = job.data

  const writeStream = createWriteStream(runUuid)
  const abortController = new AbortController()
  const cancelJob = createCancelHandler(job.id, abortController)

  let experiment: Experiment | undefined = undefined

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

    if (shouldRunMultiTurnSimulation(simulationSettings)) {
      await simulateUserResponses({
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
      })
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
    await cleanupResources({
      writeStream,
      cancelJob,
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
    })
  }
}
