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
import { ExperimentsRepository, RunsRepository } from '../../../repositories'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { startRun } from '../../../services/runs/start'
import { endRun } from '../../../services/runs/end'
import { updateRun } from '../../../services/runs/update'
import { BACKGROUND } from '../../../telemetry'
import { getJobDocumentData } from '../helpers'
import { updateExperimentStatus } from '../../../services/experiments/updateStatus'
import { queues } from '../../queues'
import {
  RunEvaluationV2JobData,
  runEvaluationV2JobKey,
} from '../evaluations/runEvaluationV2Job'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Experiment } from '../../../schema/models/types/Experiment'
import { SimulationSettings } from '@latitude-data/constants/simulation'

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
  userMessage?: string
  source?: LogSources
  simulationSettings?: SimulationSettings
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
    userMessage,
    source = LogSources.API,
    simulationSettings,
  } = job.data
  const repository = new RunsRepository(workspaceId, projectId)
  const writeStream = new RedisStream({
    key: ACTIVE_RUN_STREAM_KEY(runUuid),
    cap: ACTIVE_RUN_STREAM_CAP,
  })
  const abortController = new AbortController()
  const cancelJob = ({ jobId }: { jobId: string }) => {
    if (jobId !== job.id) return
    abortController.abort()
  }

  let experiment: Experiment | undefined = undefined

  try {
    const { workspace, document, commit } = await getJobDocumentData({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
    }).then((r) => r.unwrap())

    experiment = await fetchExperiment({ workspaceId, experimentId })

    await startRun({ workspaceId, projectId, runUuid }).then((r) => r.unwrap())

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
      userMessage,
      simulationSettings,
    }).then((r) => r.unwrap())

    await forwardStreamEvents({
      workspaceId,
      projectId,
      runUuid,
      writeStream,
      readStream: result.stream,
      repository,
    })

    if (experiment) {
      // Enqueue evaluations for current experiment
      await updateExperimentStatus(
        {
          workspaceId,
          experiment,
        },
        (progressTracker) =>
          progressTracker.incrementEnqueued(experiment!.evaluationUuids.length),
      ).then((r) => r.unwrap())

      const providerLog = (await result.lastResponse)?.providerLog
      if (!providerLog) {
        throw new NotFoundError('Provider log not found after running document')
      }

      const { evaluationsQueue } = await queues()
      experiment.evaluationUuids.forEach((evaluationUuid) => {
        const payload: RunEvaluationV2JobData = {
          workspaceId,
          commitId: experiment!.commitId,
          evaluationUuid,
          providerLogUuid: providerLog.uuid,
          datasetId: experiment!.datasetId ?? undefined,
          datasetLabel: experiment!.metadata.datasetLabels[evaluationUuid],
          datasetRowId,
          experimentUuid: experiment!.uuid,
        }

        evaluationsQueue.add('runEvaluationV2Job', payload, {
          deduplication: { id: runEvaluationV2JobKey(payload) },
        })
      })
    }
  } catch (error) {
    writeStream.write({ type: ChainEventTypes.ChainError, data: error })

    if (experiment) {
      // Mark evaluations as failed since they will not be run
      await updateExperimentStatus(
        {
          workspaceId,
          experiment,
        },
        (progressTracker) =>
          progressTracker.incrementErrors(experiment!.evaluationUuids.length),
      )
    }
  } finally {
    await writeStream.cleanup()
    await publisher.unsubscribe('cancelJob', cancelJob)

    // TODO: capture exception if we fail to end the run (but do not throw)
    await endRun({ workspaceId, projectId, runUuid })
  }
}

async function forwardStreamEvents({
  runUuid,
  readStream,
  writeStream,
  ...rest
}: {
  workspaceId: number
  projectId: number
  runUuid: string
  readStream: ReadableStream<ChainEvent>
  writeStream: RedisStream
  repository: RunsRepository
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
      await forwardRunCaption({ ...rest, runUuid, event })
    }
  } finally {
    reader.releaseLock()
  }
}

async function forwardRunCaption({
  workspaceId,
  projectId,
  runUuid,
  event: { event, data },
}: {
  workspaceId: number
  projectId: number
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
  await updateRun({ workspaceId, projectId, runUuid, caption })
}
