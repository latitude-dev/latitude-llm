import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  CommitsRepository,
  IssuesRepository,
} from '@latitude-data/core/repositories'
import { captureException } from '@latitude-data/core/utils/datadogCapture'
import { startActiveEvaluation } from '@latitude-data/core/services/evaluationsV2/active/start'
import { endActiveEvaluation } from '@latitude-data/core/services/evaluationsV2/active/end'
import { failActiveEvaluation } from '@latitude-data/core/services/evaluationsV2/active/fail'
import { Result } from '@latitude-data/core/lib/Result'
import { generateEvaluationFromIssue } from '@latitude-data/core/services/evaluationsV2/generateFromIssue/generateEvaluationFromIssue'

export type GenerateEvaluationV2FromIssueJobData = {
  workspaceId: number
  commitId: number
  issueId: number
  providerName: string
  model: string
  evaluationUuid: string
}

export const generateEvaluationV2FromIssueJob = async (
  job: Job<GenerateEvaluationV2FromIssueJobData>,
) => {
  const {
    workspaceId,
    commitId,
    issueId,
    providerName,
    model,
    evaluationUuid,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(commitId)
    .then((r) => r.unwrap())

  try {
    const issuesRepository = new IssuesRepository(workspace.id)
    const issue = await issuesRepository.find(issueId).then((r) => r.unwrap())

    await startActiveEvaluation({
      workspaceId,
      projectId: commit.projectId,
      evaluationUuid: evaluationUuid,
    })

    await generateEvaluationFromIssue({
      issue,
      workspace,
      commit,
      providerName,
      model,
    }).then((r) => r.unwrap())
  } catch (error) {
    captureException(error as Error)
    const failResult = await failActiveEvaluation({
      workspaceId,
      projectId: commit.projectId,
      evaluationUuid: evaluationUuid,
      error: error as Error,
    })
    if (!Result.isOk(failResult)) {
      captureException(
        new Error(
          `[GenerateEvaluationV2FromIssueJob] Failed to fail active evaluation`,
        ),
      )
    }
  } finally {
    const endResult = await endActiveEvaluation({
      workspaceId,
      projectId: commit.projectId,
      evaluationUuid,
    })
    if (!Result.isOk(endResult)) {
      captureException(
        new Error(
          `[GenerateEvaluationV2FromIssueJob] Failed to end active evaluation`,
        ),
      )
    }
  }
}
