import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsRepository,
  EvaluationsV2Repository,
  ExperimentsRepository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../repositories'
import {
  isErrorRetryable,
  runEvaluationV2,
} from '../../../services/evaluationsV2/run'
import { captureException } from '../../../utils/datadogCapture'
import { updateExperimentStatus } from '../experiments/shared'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'

export type RunEvaluationV2JobData = {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  spanId: string
  traceId: string
  experimentUuid?: string
  datasetId?: number
  datasetLabel?: string
  datasetRowId?: number
}

export function runEvaluationV2JobKey({
  workspaceId,
  commitId,
  evaluationUuid,
  spanId,
  traceId,
  experimentUuid,
  datasetId,
  datasetLabel,
  datasetRowId,
}: RunEvaluationV2JobData) {
  return `runEvaluationV2Job-${workspaceId}-${commitId}-${evaluationUuid}-${spanId}-${traceId}-${experimentUuid}-${datasetId}-${datasetLabel}-${datasetRowId}`
}

export const runEvaluationV2Job = async (job: Job<RunEvaluationV2JobData>) => {
  const {
    workspaceId,
    commitId,
    evaluationUuid,
    spanId,
    traceId,
    experimentUuid,
    datasetId,
    datasetLabel,
    datasetRowId,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  let experiment = undefined
  if (experimentUuid) {
    const experimentsRepository = new ExperimentsRepository(workspace.id)
    experiment = await experimentsRepository
      .findByUuid(experimentUuid)
      .then((r) => r.unwrap())

    if (experiment.finishedAt) return
  }

  try {
    const commitsRepository = new CommitsRepository(workspace.id)
    const commit = await commitsRepository
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    const spansRepo = new SpansRepository(workspace.id)
    const spansMetadataRepo = new SpanMetadatasRepository(workspace.id)
    const span = await spansRepo
      .get({ traceId, spanId })
      .then((r) => r.unwrap())
    if (!span) throw new NotFoundError('Span not found')
    if (!span.documentUuid) throw new NotFoundError('Span document not found')
    const metadata = await spansMetadataRepo
      .get({ spanId, traceId })
      .then((r) => r.unwrap())

    const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
    const evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: span.documentUuid,
        evaluationUuid: evaluationUuid,
      })
      .then((r) => r.unwrap())

    let dataset = undefined
    if (datasetId) {
      const datasetsRepository = new DatasetsRepository(workspace.id)
      dataset = await datasetsRepository.find(datasetId).then((r) => r.unwrap())
    }

    let datasetRow = undefined
    if (datasetRowId) {
      const rowsRepository = new DatasetRowsRepository(workspace.id)
      datasetRow = await rowsRepository
        .find(datasetRowId)
        .then((r) => r.unwrap())
    }

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: { ...span, metadata } as SpanWithDetails<SpanType.Prompt>,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    if (experiment) {
      await updateExperimentStatus(
        { workspaceId, experiment },
        async (progressTracker) => {
          if (result.error) return await progressTracker.incrementErrors()
          if (result.hasPassed) {
            await progressTracker.incrementCompleted()
            await progressTracker.incrementTotalScore(result.normalizedScore)
          } else await progressTracker.incrementFailed()
        },
      ).then((r) => r.unwrap())
    }
  } catch (error) {
    if (isErrorRetryable(error as Error)) throw error

    captureException(error as Error)

    if (experiment) {
      await updateExperimentStatus(
        { workspaceId, experiment },
        async (progressTracker) => await progressTracker.incrementErrors(),
      )
    }
  }
}
