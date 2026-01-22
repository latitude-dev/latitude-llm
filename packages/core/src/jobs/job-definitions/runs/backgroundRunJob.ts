import {
  ACTIVE_RUN_STREAM_CAP,
  ACTIVE_RUN_STREAM_KEY,
  ChainEvent,
  ChainEventTypes,
  humanizeTool,
  LogSources,
  RUN_CAPTION_SIZE,
  StreamEventTypes,
} from '@latitude-data/constants'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { publisher } from '../../../events/publisher'
import { RedisStream } from '../../../lib/redisStream'
import { OkType } from '../../../lib/Result'
import { buildClientToolHandlersMap } from '../../../services/documents/tools/clientTools/handlers'
import { ExperimentsRepository } from '../../../repositories'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { startRun } from '../../../services/runs/start'
import { endRun } from '../../../services/runs/end'
import { updateRun } from '../../../services/runs/update'
import { BACKGROUND } from '../../../telemetry'
import { getJobDocumentData } from '../helpers'
import { updateExperimentStatus } from '../../../services/experiments/updateStatus'
import { queues } from '../../queues'
import { Experiment } from '../../../schema/models/types/Experiment'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { isFeatureEnabledByName } from '../../../services/workspaceFeatures/isFeatureEnabledByName'
import { Result } from '../../../lib/Result'
import { captureException } from '../../../utils/datadogCapture'
import { RunEvaluationForExperimentJobData } from '../evaluations/runEvaluationForExperimentJob'
import { DeploymentTest } from '../../../schema/models/types/DeploymentTest'

export type JobHandlerContext = {
  logger: {
    debug(message: string, extra?: Record<string, unknown>): void
    info(message: string, extra?: Record<string, unknown>): void
    warn(message: string, extra?: Record<string, unknown>): void
    error(message: string, error?: Error, extra?: Record<string, unknown>): void
    addContext(context: Record<string, unknown>): void
  }
  correlationId: string
}

export type BackgroundRunJobData = {
  workspaceId: number
  projectId: number
  commitUuid: string
  experimentId?: number
  datasetRowId?: number
  documentUuid: string
  runUuid: string
  parameters?: Record<string, unknown>
  customIdentifier?: string
  tools?: string[]
  mcpHeaders?: Record<string, Record<string, string>>
  userMessage?: string
  source?: LogSources
  simulationSettings?: SimulationSettings
  activeDeploymentTest?: DeploymentTest
}

export type BackgroundRunJobResult = {
  lastResponse: Awaited<OkType<typeof runDocumentAtCommit>['lastResponse']>
  toolCalls: Awaited<OkType<typeof runDocumentAtCommit>['toolCalls']>
}

async function fetchExperiment({
  workspaceId,
  experimentId,
}: {
  workspaceId: number
  experimentId?: number
}) {
  if (!experimentId) return undefined

  const experimentsRepository = new ExperimentsRepository(workspaceId)
  const experiment = await experimentsRepository.find(experimentId)
  return experiment.unwrap()
}

export const backgroundRunJob = async (
  job: Job<BackgroundRunJobData, BackgroundRunJobResult>,
  _token?: string,
  context?: JobHandlerContext,
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

  const logger = context?.logger
  const correlationId = context?.correlationId || runUuid

  logger?.addContext({ workspaceId, projectId, documentUuid, runUuid, correlationId })
  logger?.info('Background run job starting', {
    experimentId,
    source,
    hasParameters: Object.keys(parameters).length > 0,
    toolsCount: tools.length,
  })

  const writeStream = new RedisStream({
    key: ACTIVE_RUN_STREAM_KEY(runUuid),
    cap: ACTIVE_RUN_STREAM_CAP,
  })
  const abortController = new AbortController()
  const cancelJob = ({ jobId }: { jobId: string }) => {
    if (jobId !== job.id) return
    logger?.info('Job cancellation requested')
    abortController.abort()
  }

  let experiment: Experiment | undefined = undefined

  try {
    logger?.debug('Fetching document data')
    const { workspace, document, commit } = await getJobDocumentData({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    experiment = await fetchExperiment({ workspaceId, experimentId })

    if (experiment?.finishedAt) {
      logger?.info('Experiment already finished, skipping run')
      return
    }

    logger?.debug('Starting run')
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

    logger?.info('Executing document at commit', {
      documentPath: document.path,
      commitUuid,
    })
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

    logger?.debug('Forwarding stream events')
    await forwardStreamEvents({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      runUuid,
      writeStream,
      readStream: result.stream,
    })

    if (experiment) {
      logger?.debug('Handling experiment success')
      await handleExperimentSuccess({
        experiment,
        workspaceId,
        workspace,
        runUuid,
        conversationUuid: result.uuid,
        datasetRowId,
      }).then((r) => r.unwrap())
    }

    logger?.info('Background run completed successfully')
  } catch (error) {
    logger?.error('Background run failed', error as Error, {
      experimentId,
      aborted: abortController.signal.aborted,
    })

    writeStream.write({ type: ChainEventTypes.ChainError, data: error })

    if (experiment) {
      await updateExperimentStatus(
        {
          workspaceId,
          experiment,
        },
        (progressTracker) =>
          progressTracker.documentRunFinished(runUuid, false),
      )
    }

    captureException(error as Error)
  } finally {
    logger?.debug('Cleaning up resources')
    await writeStream.close().catch(() => {
      // Silently ignore close errors to not mask the original error
    })
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
        logger?.error('Failed to end run', new Error('endRun returned error'))
        captureException(new Error(`[BackgroundRunJob] Failed to end run`))
      }
    } catch (error) {
      logger?.error('Failed to end run', error as Error)
      captureException(new Error(`[BackgroundRunJob] Failed to end run`))
    }
  }
}

async function forwardStreamEvents({
  runUuid,
  readStream,
  writeStream,
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
  readStream: ReadableStream<ChainEvent>
  writeStream: RedisStream
}) {
  const reader = readStream.getReader()
  const GRACE_PERIOD_MS = env.KEEP_ALIVE_TIMEOUT // 10 minutes

  try {
    while (true) {
      const timeoutPromise = new Promise<{ done: true; value?: undefined }>(
        (resolve) => setTimeout(() => resolve({ done: true }), GRACE_PERIOD_MS),
      )
      const readPromise = reader.read()
      const result = await Promise.race([readPromise, timeoutPromise])
      const { done, value: event } = result
      if (done) break

      await writeStream.write(event)
      await forwardRunCaption({
        runUuid,
        event,
        workspaceId,
        projectId,
        documentUuid,
        commitUuid,
      })
    }
  } finally {
    reader.releaseLock()
  }
}

async function forwardRunCaption({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
  event: { event, data },
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
  event: ChainEvent
}) {
  let caption = ''
  if (event === StreamEventTypes.Provider) {
    switch (data.type) {
      case 'tool-call':
        caption = `Running ${humanizeTool(data.toolName)}...`
        break
      default:
        return
    }
  } else {
    switch (data.type) {
      case ChainEventTypes.ProviderCompleted:
        caption = data.response.text
        break
      case ChainEventTypes.ToolsStarted:
        caption = `Running ${data.tools.map((tool) => humanizeTool(tool.name)).join(', ')}...`
        break
      case ChainEventTypes.IntegrationWakingUp:
        caption = `Waking up ${data.integrationName} integration...`
        break
    }
  }

  caption = caption.trim().slice(0, RUN_CAPTION_SIZE)
  if (!caption) return

  // TODO: capture exception if we fail to update the run (but do not throw)
  await updateRun({
    workspaceId,
    projectId,
    documentUuid,
    commitUuid,
    runUuid,
    caption,
  })
}

async function handleExperimentSuccess({
  experiment,
  workspaceId,
  workspace,
  runUuid,
  conversationUuid,
  datasetRowId,
}: {
  experiment: Experiment
  workspaceId: number
  workspace: { id: number }
  runUuid: string
  conversationUuid: string
  datasetRowId?: number
}) {
  // Mark document as finished (success)
  await updateExperimentStatus(
    {
      workspaceId,
      experiment,
    },
    (progressTracker) => progressTracker.documentRunFinished(runUuid, true),
  )

  // TODO(): This is temporary while we think of a more long lasting solution to ban/rate limit users
  const evaluationsDisabledResult = await isFeatureEnabledByName(
    workspace.id,
    'evaluationsDisabled',
  )

  const evaluationsDisabled = evaluationsDisabledResult.unwrap()
  if (evaluationsDisabled) {
    // Evaluations are disabled for this workspace, skip enqueueing
    return Result.nil()
  }

  const { evaluationsQueue } = await queues()
  const parametersSource = experiment.metadata.parametersSource
  const datasetLabels =
    parametersSource.source === 'dataset' ? parametersSource.datasetLabels : {}

  try {
    const results = await Promise.all(
      experiment.evaluationUuids.map((evaluationUuid) => {
        const payload: RunEvaluationForExperimentJobData = {
          workspaceId,
          datasetRowId,
          evaluationUuid,
          conversationUuid,
          experimentUuid: experiment.uuid,
          commitId: experiment.commitId,
          datasetId: experiment.datasetId ?? undefined,
          datasetLabel: datasetLabels[evaluationUuid],
        }

        return evaluationsQueue.add('runEvaluationForExperimentJob', payload)
      }),
    )
    return Result.ok(results)
  } catch (err) {
    return Result.error(err as Error)
  }
}
