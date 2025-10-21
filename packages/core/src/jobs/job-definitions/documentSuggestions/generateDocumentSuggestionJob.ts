import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError, UnprocessableEntityError } from '../../../lib/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'
import { generateDocumentSuggestion } from '../../../services/documentSuggestions'
import { captureException } from '../../../utils/workers/datadog'

export type GenerateDocumentSuggestionJobData = {
  workspaceId: number
  commitId: number
  documentUuid: string
  evaluationUuid: string
}

// TODO(evalsv2): Add tests
export function generateDocumentSuggestionJobKey({
  workspaceId,
  commitId,
  documentUuid,
  evaluationUuid,
}: GenerateDocumentSuggestionJobData) {
  return `generateDocumentSuggestionJob-${workspaceId}-${commitId}-${documentUuid}-${evaluationUuid}`
}

export const generateDocumentSuggestionJob = async (
  job: Job<GenerateDocumentSuggestionJobData>,
) => {
  if (!env.LATITUDE_CLOUD) return // Avoid spamming errors locally

  const { workspaceId, commitId, documentUuid, evaluationUuid } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(commitId)
    .then((r) => r.unwrap())

  const documentsRepository = new DocumentVersionsRepository(workspace.id)
  const document = await documentsRepository
    .getDocumentAtCommit({
      commitUuid: commit.uuid,
      documentUuid: documentUuid,
    })
    .then((r) => r.unwrap())

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const evaluation = await evaluationsRepository
    .getAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      evaluationUuid,
    })
    .then((r) => r.unwrap())

  const result = await generateDocumentSuggestion({
    document: document,
    evaluation: evaluation,
    commit: commit,
    workspace: workspace,
  })
  if (result.error) {
    if (result.error instanceof UnprocessableEntityError) {
      captureException(result.error)
    } else throw result.error
  }
}
