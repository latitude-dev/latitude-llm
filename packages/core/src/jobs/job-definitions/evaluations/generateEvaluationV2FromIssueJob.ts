import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { findIssue } from '@latitude-data/core/queries/issues/findById'
import { captureException } from '@latitude-data/core/utils/datadogCapture'
import { startActiveEvaluation } from '@latitude-data/core/services/evaluationsV2/active/start'
import { failActiveEvaluation } from '@latitude-data/core/services/evaluationsV2/active/fail'
import { Result } from '@latitude-data/core/lib/Result'
import { generateEvaluationFromIssue } from '@latitude-data/core/services/evaluationsV2/generateFromIssue/generateEvaluationFromIssue'
import { endActiveEvaluation } from '../../../services/evaluationsV2/active/end'
import { MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE } from '@latitude-data/constants/issues'

export type GenerateEvaluationV2FromIssueJobData = {
  workspaceId: number
  commitId: number
  issueId: number
  providerName: string
  model: string
  workflowUuid: string
  generationAttempt: number
  falsePositivesSpanAndTraceIdPairs?: {
    spanId: string
    traceId: string
  }[]
  falseNegativesSpanAndTraceIdPairs?: {
    spanId: string
    traceId: string
  }[]
  previousEvaluationConfiguration?: {
    criteria: string
    passDescription: string
    failDescription: string
  }
}

/*
  This job is in charge of generating an evaluation from an issue.

  The possible scenarios of this job are:
  1. The job is successful (no error and not retrying the generation) -> generate the evaluation and end the active evaluation
  2. The job failed but not in the last attempt -> let BullMQ retry the job
  3. The job failed in the last attempt -> fail the active evaluation and end the active evaluation
*/
export const generateEvaluationV2FromIssueJob = async (
  job: Job<GenerateEvaluationV2FromIssueJobData>,
) => {
  const {
    workspaceId,
    commitId,
    issueId,
    providerName,
    model,
    workflowUuid,
    generationAttempt,
    falsePositivesSpanAndTraceIdPairs,
    falseNegativesSpanAndTraceIdPairs,
    previousEvaluationConfiguration,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(commitId)
    .then((r) => r.unwrap())

  const isOverMaxAttempts =
    generationAttempt > MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE

  try {
    if (isOverMaxAttempts) {
      // Dont change the error message, it's used to change the failure message in the UI
      throw new Error(`Max attempts to generate evaluation from issue reached`)
    }

    const issue = await findIssue({ workspaceId: workspace.id, id: issueId })

    if (generationAttempt == 1) {
      await startActiveEvaluation({
        workspaceId,
        projectId: commit.projectId,
        workflowUuid,
      })
    }

    await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName,
      model,
      workflowUuid,
      generationAttempt,
      falsePositivesSpanAndTraceIdPairs,
      falseNegativesSpanAndTraceIdPairs,
      previousEvaluationConfiguration,
    }).then((r) => r.unwrap())
  } catch (error) {
    const { attemptsMade: jobRetryAttempts } = job
    // Job attemptsMade starts at 0
    const isLastJobRetryAttempt =
      jobRetryAttempts + 1 >= MAX_ATTEMPTS_TO_GENERATE_EVALUATION_FROM_ISSUE

    if (isLastJobRetryAttempt || isOverMaxAttempts) {
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
            `[GenerateEvaluationV2FromIssueJob] Failed to fail active evaluation`,
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
            `[GenerateEvaluationV2FromIssueJob] Failed to end active evaluation`,
          ),
        )
      }
    }
    throw error
  }
}
