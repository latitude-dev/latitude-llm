import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { publisher } from '../../../events/publisher'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import { findIssue } from '../../../queries/issues/findById'
import {
  CommitsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'
import { alignIssueEvaluation } from '../../../services/issues/evaluations/align'
import { captureException } from '../../../utils/datadogCapture'

export type AlignEvaluationJobData = {
  workspaceId: number
  commitId: number
  issueId: number
  evaluationUuid?: string
  provider?: string
  model?: string
}

export function alignEvaluationJobKey({
  workspaceId,
  issueId,
  evaluationUuid,
}: AlignEvaluationJobData) {
  return `alignEvaluationJob-${workspaceId}-${issueId}-${evaluationUuid}`
}

export const alignEvaluationJob = async (job: Job<AlignEvaluationJobData>) => {
  if (!env.LATITUDE_CLOUD) return // Avoid spamming errors locally

  const { workspaceId, commitId, issueId, evaluationUuid, provider, model } =
    job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const issue = await findIssue({ workspaceId, id: issueId })

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(commitId)
    .then((r) => r.unwrap())

  let evaluation
  if (evaluationUuid) {
    const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
    evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        commitId: commitId,
        documentUuid: issue.documentUuid,
        evaluationUuid: evaluationUuid,
      })
      .then((r) => r.unwrap())

    if (
      evaluation.type !== EvaluationType.Llm ||
      evaluation.metric !== LlmEvaluationMetric.Custom
    ) {
      return captureException(
        new UnprocessableEntityError(
          'Cannot align a non-custom llm evaluation for an issue',
        ),
      )
    }
  }

  const abortController = new AbortController()
  const cancelJob = ({ jobId }: { jobId: string }) => {
    if (jobId !== job.id) return
    abortController.abort()
  }
  publisher.subscribe('cancelJob', cancelJob)

  try {
    await alignIssueEvaluation({
      issue: issue,
      evaluation: evaluation as EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Custom>, // prettier-ignore
      provider: provider,
      model: model,
      commit: commit,
      workspace: workspace,
      abortSignal: abortController.signal,
    }).then((r) => r.unwrap())
  } catch (error) {
    captureException(error as Error)
  } finally {
    await publisher.unsubscribe('cancelJob', cancelJob)
  }
}
