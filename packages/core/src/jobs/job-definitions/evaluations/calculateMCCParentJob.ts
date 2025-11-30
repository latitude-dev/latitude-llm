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

export type CalculateMCCParentJobData = {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  spanAndTraceIdPairsOfPositiveEvaluationRuns: {
    spanId: string
    traceId: string
  }[]
  spanAndTraceIdPairsOfNegativeEvaluationRuns: {
    spanId: string
    traceId: string
  }[]
}

export const calculateMCCParentJob = async (
  job: Job<CalculateMCCParentJobData>,
) => {
  const {
    workspaceId,
    commitId,
    evaluationUuid,
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

    const evaluateConfigurationResult = await evaluateConfiguration({
      childrenValues,
      spanAndTraceIdPairsOfPositiveEvaluationRuns,
      spanAndTraceIdPairsOfNegativeEvaluationRuns,
    })

    if (!Result.isOk(evaluateConfigurationResult)) {
      return evaluateConfigurationResult
    }
    const mcc = evaluateConfigurationResult.unwrap()

    // TODO(evaluation-generation): If the quality metric is less than the minimum threshold, we retry generating another configuration
    if (mcc < MIN_QUALITY_METRIC_THRESHOLD) {
      return Result.error(
        new Error(`MCC is less than ${MIN_QUALITY_METRIC_THRESHOLD}`),
      )
    }

    const evaluationRepository = new EvaluationsV2Repository(workspace.id)
    const evaluationResult = await evaluationRepository.find(evaluationUuid)

    if (!Result.isOk(evaluationResult)) {
      throw new Error(`Evaluation not found`)
    }

    const evaluation = evaluationResult.unwrap()

    await updateEvaluationV2({
      evaluation,
      workspace,
      commit: commit,
      qualityMetric: mcc,
    })

    const endResult = await endActiveEvaluation({
      workspaceId,
      projectId: commit.projectId,
      evaluationUuid,
    })
    if (!Result.isOk(endResult)) {
      captureException(
        new Error(`[CalculateMCCParentJob] Failed to end active evaluation`),
      )
    }
  } catch (error) {
    const { attemptsMade, opts } = job
    const maxAttempts = opts.attempts ?? 1
    const isLastAttempt = attemptsMade + 1 >= maxAttempts

    // Only failing in last attempt of the job, else the retry system is useless
    if (isLastAttempt) {
      captureException(error as Error)
      const failResult = await failActiveEvaluation({
        workspaceId,
        projectId: commit.projectId,
        evaluationUuid: evaluationUuid,
        error: error as Error,
      })
      if (!Result.isOk(failResult)) {
        captureException(
          new Error(`[CalculateMCCParentJob] Failed to fail active evaluation`),
        )
      }
    }
    throw error
  }
}
