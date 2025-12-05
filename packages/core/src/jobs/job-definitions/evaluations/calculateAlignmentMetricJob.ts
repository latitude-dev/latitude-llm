import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { evaluateConfiguration } from '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration'
import { MIN_ALIGNMENT_METRIC_THRESHOLD } from '@latitude-data/constants/issues'
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

export type CalculateAlignmentMetricJobData = {
  workspaceId: number
  commitId: number
  workflowUuid: string
  generationAttempt: number
  evaluationUuid: string
  documentUuid: string
  issueId: number
  providerName: string
  model: string
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: {
    spanId: string
    traceId: string
  }[]
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: {
    spanId: string
    traceId: string
  }[]
}

/*
  This job is a parent job of a BullMQ flow which calculates the alignment metric of an evaluation when all its runEvaluationV2Job children have finished.
  The alignment metric used at the moment is the MCC (Matthews Correlation Coefficient)

  The possible scenarios of this job are:
  1. The job is successful (no error and not retrying the generation) -> update the evaluation with the alignment metric and end the active evaluation
  2. The job failed but not in the last attempt -> let BullMQ retry the job
  3. The job failed in the last attempt -> fail the active evaluation and end the active evaluation
  4. The job is retrying the generation -> delete the evaluation and retry the generation
*/

export const calculateAlignmentMetricJob = async (
  job: Job<CalculateAlignmentMetricJobData>,
) => {
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
    spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const commitRepository = new CommitsRepository(workspace.id)
  const commitResult = await commitRepository.find(commitId)
  if (!Result.isOk(commitResult)) {
    throw new Error(`Commit not found`)
  }
  const commit = commitResult.unwrap()

  const evaluationRepository = new EvaluationsV2Repository(workspace.id)
  const evaluation = await evaluationRepository
    .getAtCommitByDocument({
      projectId: commit.projectId,
      commitUuid: commit.uuid,
      documentUuid,
      evaluationUuid,
    })
    .then((r) => r.unwrap())

  try {
    const { failed, ignored, processed, unprocessed } =
      await job.getDependenciesCount()

    // When a runEvalJob fails, it will automatically run the parent and not wait for the other children to finish (the rest will be unprocessed)
    //  so in this scenario, we throw an error and retry the job after the exponential delay
    const tooManyFailedEvaluationRuns =
      (failed ?? 0) + (ignored ?? 0) + (unprocessed ?? 0) >
      (processed ?? 0) % 10

    if (tooManyFailedEvaluationRuns) {
      throw new Error(
        `${failed ?? 0} failed and ${ignored ?? 0} ignored children. Waiting for ${unprocessed ?? 0} unprocessed children to complete`,
      )
    }

    const childrenValues = await job.getChildrenValues()

    const { mcc, confusionMatrix } = await evaluateConfiguration({
      childrenValues,
      spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
      spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    }).then((r) => r.unwrap())

    if (mcc < MIN_ALIGNMENT_METRIC_THRESHOLD) {
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
      alignmentMetric: mcc,
      alignmentMetricMetadata: {
        confusionMatrix,
      },
    }).then((r) => r.unwrap())

    const endResult = await endActiveEvaluation({
      workspaceId,
      projectId: commit.projectId,
      workflowUuid,
    })
    if (!Result.isOk(endResult)) {
      captureException(
        new Error(
          `[CalculateAlignmentMetricJob] Failed to end active evaluation`,
        ),
      )
    }
  } catch (error) {
    const { attemptsMade, opts } = job
    const maxAttempts = opts.attempts ?? 1
    // Job attemptsMade starts at 0
    const isLastAttempt = attemptsMade + 1 >= maxAttempts

    // Only failing in last attempt of the job, there are more attempts to retry to calculate the alignment metric if not
    if (isLastAttempt) {
      await deleteEvaluationV2({
        evaluation: evaluation,
        commit: commit,
        workspace: workspace,
      })

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
            `[CalculateAlignmentMetricJob] Failed to fail active evaluation`,
          ),
        )
      }
      const endResult = await endActiveEvaluation({
        workspaceId,
        projectId: commit.projectId,
        workflowUuid,
      })

      if (!Result.isOk(endResult)) {
        captureException(
          new Error(
            `[CalculateAlignmentMetricJob] Failed to end active evaluation`,
          ),
        )
      }
    }

    // Throwing the error here will propagate the error to BullMQ, which will retry the job
    throw error
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
