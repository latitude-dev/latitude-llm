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
*/

export const calculateQualityMetricJob = async (
  job: Job<CalculateQualityMetricJobData>,
) => {
  let caughtError: Error | null = null
  let isLastAttempt: boolean = false

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

    // TODO(evaluation-generation): If more than 10% of the evaluation runs failed, we retry the generation of the evaluation runs (or we just fail the job)
    const tooManyFailedEvaluationRuns =
      (failed ?? 0) + (ignored ?? 0) + (unprocessed ?? 0) >
      (processed ?? 0) % 10

    if (tooManyFailedEvaluationRuns) {
      throw new Error('Too many failed evaluation runs')
    }

    const childrenValues = await job.getChildrenValues()
    console.log('childrenValues', childrenValues)

    const mcc = await evaluateConfiguration({
      childrenValues,
      spanAndTraceIdPairsOfPositiveEvaluationRuns,
      spanAndTraceIdPairsOfNegativeEvaluationRuns,
    }).then((r) => r.unwrap())

    console.log('mcc', mcc)

    if (mcc < MIN_QUALITY_METRIC_THRESHOLD) {
      const { generateEvaluationsQueue } = await queues()
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
      return
    }

    const evaluationRepository = new EvaluationsV2Repository(workspace.id)
    const evaluation = await evaluationRepository
      .getAtCommitByDocument({
        projectId: commit.projectId,
        commitUuid: commit.uuid,
        documentUuid,
        evaluationUuid,
      })
      .then((r) => r.unwrap())

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
    isLastAttempt = attemptsMade + 1 >= maxAttempts

    // Only failing in last attempt of the job, else the retry system is useless
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
    const jobEndedCorrectlyOrLastAttemptWithError =
      !caughtError || (caughtError && isLastAttempt)
    if (jobEndedCorrectlyOrLastAttemptWithError) {
      const endResult = await endActiveEvaluation({
        workspaceId,
        projectId: commit.projectId,
        workflowUuid,
      })
      if (!Result.isOk(endResult)) {
        captureException(
          new Error(
            `[CalculateQualityMetricJob] Failed to end active evaluation`,
          ),
        )
      }
    }
  }
}
