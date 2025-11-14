import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { publisher } from '../../../events/publisher'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  IssuesRepository,
  ProjectsRepository,
  SpansRepository,
} from '../../../repositories'
import { assignEvaluationResultV2ToIssue } from '../../../services/evaluationsV2/results/assign'
import { discoverIssue } from '../../../services/issues/discover'
import { generateIssue } from '../../../services/issues/generate'
import { isFeatureEnabledByName } from '../../../services/workspaceFeatures/isFeatureEnabledByName'
import { captureException } from '../../../utils/datadogCapture'

export type DiscoverResultIssueJobData = {
  workspaceId: number
  resultId: number
}

export function discoverResultIssueJobKey({
  workspaceId,
  resultId,
}: DiscoverResultIssueJobData) {
  return `discoverResultIssueJob-${workspaceId}-${resultId}`
}

export const discoverResultIssueJob = async (
  job: Job<DiscoverResultIssueJobData>,
) => {
  if (!env.LATITUDE_CLOUD) return // Avoid spamming errors locally

  const { workspaceId, resultId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const enabled = await isFeatureEnabledByName(workspace.id, 'issues').then((r) => r.unwrap()) // prettier-ignore
  if (!enabled) return

  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const result = await resultsRepository.find(resultId).then((r) => r.unwrap())

  if (result.issueId) return

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(result.commitId)
    .then((r) => r.unwrap())

  const projectsRepository = new ProjectsRepository(workspace.id)
  const project = await projectsRepository
    .getProjectById(commit.projectId)
    .then((r) => r.unwrap())

  const spansRepository = new SpansRepository(workspace.id)
  const span = await spansRepository
    .get({ spanId: result.evaluatedSpanId!, traceId: result.evaluatedTraceId! })
    .then((r) => r.unwrap())
  if (!span)
    throw new NotFoundError(
      `Span not found for spanId: ${result.evaluatedSpanId} and traceId: ${result.evaluatedTraceId}`,
    )

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const evaluation = await evaluationsRepository
    .getAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: span.documentUuid!,
      evaluationUuid: result.evaluationUuid,
    })
    .then((r) => r.unwrap())

  const documentVersionsRepository = new DocumentVersionsRepository(
    workspace.id,
  )
  const document = await documentVersionsRepository
    .getDocumentByUuid({
      documentUuid: span.documentUuid!,
      commitUuid: commit.uuid,
    })
    .then((r) => r.unwrap())

  const discovering = await discoverIssue({
    result: { result, evaluation },
    document,
    project,
  })
  if (discovering.error) {
    if (discovering.error instanceof UnprocessableEntityError) {
      return captureException(discovering.error)
    } else {
      throw discovering.error
    }
  }
  const { embedding, issue: selected } = discovering.value

  let newIssue
  let existingIssue
  if (!selected) {
    const generating = await generateIssue({
      results: [{ result, evaluation }],
    })
    if (generating.error) {
      if (generating.error instanceof UnprocessableEntityError) {
        return captureException(generating.error)
      } else {
        throw generating.error
      }
    }
    newIssue = generating.value
  } else {
    const issuesRepository = new IssuesRepository(workspace.id)
    existingIssue = await issuesRepository
      .findByUuid(selected.uuid)
      .then((r) => r.unwrap())
  }

  const { issue: updatedIssue } = await assignEvaluationResultV2ToIssue({
    result: { ...result, embedding },
    evaluation: evaluation,
    issue: existingIssue,
    create: newIssue
      ? {
          title: newIssue.title,
          description: newIssue.description,
          document: document,
          project: project,
        }
      : undefined,
    workspace: workspace,
  }).then((r) => r.unwrap())

  if (newIssue) {
    await publisher.publishLater({
      type: 'issueDiscovered',
      data: {
        workspaceId: workspace.id,
        issueId: updatedIssue.id,
      },
    })
  }
}
