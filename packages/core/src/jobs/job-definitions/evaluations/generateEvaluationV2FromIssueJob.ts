import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import { CommitsRepository, IssuesRepository } from '../../../repositories'
import { generateEvaluationFromIssueWithCopilot } from '../../../services/evaluationsV2/generateFromIssue'
import { captureException } from '../../../utils/datadogCapture'
import { startActiveEvaluation } from '../../../services/evaluationsV2/active/start'
import { endActiveEvaluation } from '../../../services/evaluationsV2/active/end'
import { failActiveEvaluation } from '../../../services/evaluationsV2/active/fail'
import { Result } from '../../../lib/Result'

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

    const generatedEvaluation = await generateEvaluationFromIssueWithCopilot({
      issue,
      commit,
      workspace,
      providerName,
      model,
    })

    return generatedEvaluation.unwrap()
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
