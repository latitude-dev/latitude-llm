import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import { CommitsRepository, IssuesRepository } from '../../../repositories'
import { generateEvaluationFromIssueWithCopilot } from '../../../services/evaluationsV2/generateFromIssue'
import { captureException } from '../../../utils/datadogCapture'

export type GenerateEvaluationV2FromIssueJobData = {
  workspaceId: number
  commitId: number
  issueId: number
  providerName: string
  model: string
}

export const generateEvaluationV2FromIssueJob = async (
  job: Job<GenerateEvaluationV2FromIssueJobData>,
) => {
  const { workspaceId, commitId, issueId, providerName, model } = job.data

  try {
    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace)
      throw new NotFoundError(`Workspace not found ${workspaceId}`)

    const commitsRepository = new CommitsRepository(workspace.id)
    const commit = await commitsRepository
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    const issuesRepository = new IssuesRepository(workspace.id)
    const issue = await issuesRepository.find(issueId).then((r) => r.unwrap())

    await generateEvaluationFromIssueWithCopilot({
      issue,
      commit,
      workspace,
      providerName,
      model,
    }).then((r) => r.unwrap())
  } catch (error) {
    captureException(error as Error)
  }
}
