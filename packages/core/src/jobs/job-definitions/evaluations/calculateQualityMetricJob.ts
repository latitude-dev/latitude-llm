import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { evaluateConfiguration } from '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration'
import { MIN_QUALITY_METRIC_THRESHOLD } from '@latitude-data/constants/issues'
import {
  CommitsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'
import { updateEvaluationV2 } from '../../../services/evaluationsV2/update'
import { endActiveEvaluation } from '../../../services/evaluationsV2/active/end'
import { captureException } from '../../../utils/datadogCapture'
import { failActiveEvaluation } from '../../../services/evaluationsV2/active/fail'
import { queues } from '../../queues'
import { deleteEvaluationV2 } from '../../../services/evaluationsV2/delete'
import { EvaluationV2 } from '../../../constants'
import { Commit } from '../../../schema/models/types/Commit'
import { Workspace } from '../../../schema/models/types/Workspace'

export type CalculateQualityMetricJobData = {
  workspaceId: number
  commitId: number
  workflowUuid: string
  generationAttempt: number
  evaluationUuid: string
  documentUuid: string
  issueId: number
  providerName: string
  model: string
  spanAndTraceIdPairsOfPositiveEvaluationRuns: {
    spanId: string
    traceId: string
  }[]
  spanAndTraceIdPairsOfNegativeEvaluationRuns: {
    spanId: string
    traceId: string
  }[]
}

/*
  This job is a parent job of a BullMQ flow which calculates the quality metric of an evaluation when all its runEvaluationV2Job children have finished.
  The quality metric used at the moment is the MCC (Matthews Correlation Coefficient)

  The possible scenarios of this job are:
  1. The job is successful (no error and not retrying the generation) -> update the evaluation with the quality metric and end the active evaluation
  2. The job failed but not in the last attempt -> let BullMQ retry the job
  3. The job failed in the last attempt -> fail the active evaluation and end the active evaluation
  4. The job is retrying the generation -> delete the evaluation and retry the generation
*/

export const calculateQualityMetricJob = async (
  job: Job<CalculateQualityMetricJobData>,
) => {
  let caughtError: Error | null = null
  let retryGeneration: boolean = false

  const {
    workspaceId,
    commitId,
    workflowUuid,
    generationAttempt,
    evaluationUuid,
    documentUuid,
    issueId,
    providerName,
    model,
    spanAndTraceIdPairsOfPositiveEvaluationRuns,
    spanAndTraceIdPairsOfNegativeEvaluationRuns,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const commitRepository = new CommitsRepository(workspace.id)
  const commitResult = await commitRepository.find(commitId)
  if (!Result.isOk(commitResult)) {
    throw new Error(`Commit not found`)
  }
  const commit = commitResult.unwrap()

  try {
    const { failed, ignored, processed, unprocessed } =
      await job.getDependenciesCount()

    console.log('failed', failed)
    console.log('ignored', ignored)
    console.log('processed', processed)
    console.log('unprocessed', unprocessed)

    const evaluationRepository = new EvaluationsV2Repository(workspace.id)
    const evaluation = await evaluationRepository
      .getAtCommitByDocument({
        projectId: commit.projectId,
        commitUuid: commit.uuid,
        documentUuid,
        evaluationUuid,
      })
      .then((r) => r.unwrap())

    const tooManyFailedEvaluationRuns =
      (failed ?? 0) + (ignored ?? 0) + (unprocessed ?? 0) >
      (processed ?? 0) % 10

    if (tooManyFailedEvaluationRuns) {
      retryGeneration = true
      return await deleteEvaluationAndRetryGeneration({
        evaluation: evaluation,
        commit: commit,
        workspace: workspace,
        issueId: issueId,
        providerName: providerName,
        model: model,
        workflowUuid: workflowUuid,
        generationAttempt: generationAttempt,
      })
    }

    const childrenValues = await job.getChildrenValues()

    const mcc = await evaluateConfiguration({
      childrenValues,
      spanAndTraceIdPairsOfPositiveEvaluationRuns,
      spanAndTraceIdPairsOfNegativeEvaluationRuns,
    }).then((r) => r.unwrap())

    console.log('mcc', mcc)

    if (mcc < MIN_QUALITY_METRIC_THRESHOLD) {
      retryGeneration = true
      return await deleteEvaluationAndRetryGeneration({
        evaluation: evaluation,
        commit: commit,
        workspace: workspace,
        issueId: issueId,
        providerName: providerName,
        model: model,
        workflowUuid: workflowUuid,
        generationAttempt: generationAttempt,
      })
    }

    await updateEvaluationV2({
      evaluation,
      workspace,
      commit: commit,
      qualityMetric: mcc,
    }).then((r) => r.unwrap())
  } catch (error) {
    caughtError = error as Error
    const { attemptsMade, opts } = job
    const maxAttempts = opts.attempts ?? 1
    const isLastAttempt = attemptsMade + 1 >= maxAttempts

    // Only failing in last attempt of the job, there are more attempts to retry to calculate the quality metric if not
    if (isLastAttempt) {
      captureException(error as Error)
      const failResult = await failActiveEvaluation({
        workspaceId,
        projectId: commit.projectId,
        workflowUuid,
        error: error as Error,
      })
      if (!Result.isOk(failResult)) {
        captureException(
          new Error(
            `[CalculateQualityMetricJob] Failed to fail active evaluation`,
          ),
        )
      }
    }
    throw error
  } finally {
    // If we are retrying the generation, we don't want to end the active evaluation, as the generation process isn't over yet
    if (retryGeneration) {
      return // eslint-disable-line no-unsafe-finally
    }

    const { attemptsMade, opts } = job
    const maxAttempts = opts.attempts ?? 1
    const isLastAttempt = attemptsMade + 1 >= maxAttempts

    // If the job is successful (no error and not retrying the generation) or its the job's last attempt and it failed, we want to end the active evaluation
    const jobFailedButNotLastAttempt = caughtError && !isLastAttempt
    if (!jobFailedButNotLastAttempt) {
      const endResult = await endActiveEvaluation({
        workspaceId,
        projectId: commit.projectId,
        workflowUuid,
      })
      if (!Result.isOk(endResult)) {
        console.log(endResult.error)
        captureException(
          new Error(
            `[CalculateQualityMetricJob] Failed to end active evaluation`,
          ),
        )
      }
    }
    // If the job failed but not in the last attempt, the error from catch block will propagate
  }
}

async function deleteEvaluationAndRetryGeneration({
  evaluation,
  commit,
  workspace,
  issueId,
  providerName,
  model,
  workflowUuid,
  generationAttempt,
}: {
  evaluation: EvaluationV2
  commit: Commit
  workspace: Workspace
  issueId: number
  providerName: string
  model: string
  workflowUuid: string
  generationAttempt: number
}) {
  const { generateEvaluationsQueue } = await queues()
  await deleteEvaluationV2({
    evaluation: evaluation,
    commit: commit,
    workspace: workspace,
  })
  // TODO(evaluation-generation): add feedback to the generation from what failed
  await generateEvaluationsQueue.add(
    'generateEvaluationV2FromIssueJob',
    {
      workspaceId: workspace.id,
      commitId: commit.id,
      issueId: issueId,
      providerName: providerName,
      model: model,
      workflowUuid: workflowUuid,
      generationAttempt: generationAttempt + 1, // retry generating another configuration
    },
    {
      jobId: `generateEvaluationV2FromIssueJob:wf=${workflowUuid}:generationAttempt=${generationAttempt + 1}`,
    },
  )
}
