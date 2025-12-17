import { Job } from 'bullmq'
import {
  CommitsRepository,
  EvaluationsV2Repository,
  IssuesRepository,
  ProjectsRepository,
} from '../../../repositories'
import { Result } from '../../../lib/Result'
import { NotFoundError } from '../../../lib/errors'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { recalculateAlignmentMetric } from '../../../services/evaluationsV2/generateFromIssue/recalculateAlignmentMetric'
import {
  EvaluationV2,
  EvaluationType,
  LlmEvaluationMetric,
} from '../../../constants'

export type UpdateEvaluationAlignmentJobData = {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  documentUuid: string
  issueId: number
}

export async function updateEvaluationAlignmentJob(
  job: Job<UpdateEvaluationAlignmentJobData>,
) {
  const { workspaceId, commitId, evaluationUuid, documentUuid, issueId } = job.data // prettier-ignore
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const commitRepository = new CommitsRepository(workspace.id)
  const commitResult = await commitRepository.find(commitId)
  if (!Result.isOk(commitResult)) throw new NotFoundError('Commit not found')
  const commit = commitResult.unwrap()

  const projectRepository = new ProjectsRepository(workspace.id)
  const projectResult = await projectRepository.find(commit.projectId)
  if (!Result.isOk(projectResult)) throw new NotFoundError('Project not found')
  const project = projectResult.unwrap()

  const evaluationRepository = new EvaluationsV2Repository(workspaceId)
  const evaluationResult = await evaluationRepository.getAtCommitByDocument({
    projectId: commit.projectId,
    commitUuid: commit.uuid,
    documentUuid,
    evaluationUuid,
  })
  if (!Result.isOk(evaluationResult)) throw new NotFoundError('Evaluation not found') // prettier-ignore
  const evaluation = evaluationResult.unwrap()

  const issueRepository = new IssuesRepository(workspace.id)
  const issue = await issueRepository.findById({
    project,
    issueId,
  })
  if (!issue) throw new NotFoundError('Issue not found')

  await recalculateAlignmentMetric({
    workspace,
    commit,
    evaluationToEvaluate: evaluation as EvaluationV2<
      EvaluationType.Llm,
      LlmEvaluationMetric.Binary
    >,
    issue,
  })
}
