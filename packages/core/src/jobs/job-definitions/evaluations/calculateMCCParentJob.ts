import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { evaluateConfiguration } from '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration'

export type CalculateMCCParentJobData = {
  workspaceId: number
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
    spanAndTraceIdPairsOfPositiveEvaluationRuns,
    spanAndTraceIdPairsOfNegativeEvaluationRuns,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const { failed, ignored, processed, unprocessed } =
    await job.getDependenciesCount()

  console.log('failed', failed)
  console.log('ignored', ignored)
  console.log('processed', processed)
  console.log('unprocessed', unprocessed)

  // TODO(evaluation-generation): If more than 10% of the evaluation runs failed, we retry the generation of the evaluation runs (or we just fail the job)
  const tooManyFailedEvaluationRuns =
    (failed ?? 0) + (ignored ?? 0) + (unprocessed ?? 0) > (processed ?? 0) % 10

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
}
