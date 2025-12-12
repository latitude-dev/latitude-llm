import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { EvaluationV2 } from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import {
  CommitsRepository,
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  IssuesRepository,
} from '../../../repositories'
import { generateIssue } from '../../../services/issues/generate'
import { isIssueActive } from '../../../services/issues/shared'
import { updateIssue } from '../../../services/issues/update'
import { captureException } from '../../../utils/datadogCapture'

export type GenerateIssueDetailsJobData = {
  workspaceId: number
  issueId: number
}

export function generateIssueDetailsJobKey({
  workspaceId,
  issueId,
}: GenerateIssueDetailsJobData) {
  return `generateIssueDetailsJob-${workspaceId}-${issueId}`
}

export const generateIssueDetailsJob = async (
  job: Job<GenerateIssueDetailsJobData>,
) => {
  if (!env.LATITUDE_CLOUD) return // Avoid spamming errors locally

  const { workspaceId, issueId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const issuesRepository = new IssuesRepository(workspace.id)
  const issue = await issuesRepository.find(issueId).then((r) => r.unwrap())

  if (!isIssueActive(issue)) return

  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const results = await resultsRepository
    .selectForIssueGeneration({ issueId: issue.id })
    .then((r) => r.unwrap())

  const commitsRepository = new CommitsRepository(workspace.id)
  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)

  const evaluations: Record<string, EvaluationV2[]> = {}

  const selected = []
  for (const result of results) {
    if (!evaluations[result.commitId]) {
      const commit = await commitsRepository
        .getCommitById(result.commitId)
        .then((r) => r.unwrap())

      evaluations[result.commitId] = await evaluationsRepository
        .list({
          commitUuid: commit.uuid,
          documentUuid: issue.documentUuid,
        })
        .then((r) => r.unwrap())
    }

    const evaluation = evaluations[result.commitId]!.find(
      (e) => e.uuid === result.evaluationUuid,
    )
    if (!evaluation) continue

    selected.push({ result, evaluation })
  }

  const generating = await generateIssue({ results: selected })
  if (generating.error) {
    if (generating.error instanceof UnprocessableEntityError) {
      return captureException(generating.error)
    } else {
      throw generating.error
    }
  }
  const details = generating.value

  await updateIssue({
    title: details.title,
    description: details.description,
    issue: issue,
  }).then((r) => r.unwrap())
}
