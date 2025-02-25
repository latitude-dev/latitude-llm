import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access'
import { NotFoundError, UnprocessableEntityError } from '../../../lib'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsRepository,
} from '../../../repositories'
import { generateDocumentSuggestion } from '../../../services/documentSuggestions'

export type GenerateDocumentSuggestionJobData = {
  workspaceId: number
  commitId: number
  documentUuid: string
  evaluationId: number
}

export function generateDocumentSuggestionJobKey({
  workspaceId,
  commitId,
  documentUuid,
  evaluationId,
}: GenerateDocumentSuggestionJobData) {
  return `generateDocumentSuggestionJob-${workspaceId}-${commitId}-${documentUuid}-${evaluationId}`
}

export const generateDocumentSuggestionJob = async (
  job: Job<GenerateDocumentSuggestionJobData>,
) => {
  if (!env.LATITUDE_CLOUD) return // Avoid spamming errors locally

  const { workspaceId, commitId, documentUuid, evaluationId } = job.data

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

  const evaluationsRepository = new EvaluationsRepository(workspace.id)
  const evaluation = await evaluationsRepository
    .find(evaluationId)
    .then((r) => r.unwrap())

  const result = await generateDocumentSuggestion({
    document: document,
    evaluation: evaluation,
    workspace: workspace,
  })

  if (result.error && !(result.error instanceof UnprocessableEntityError)) {
    result.unwrap()
  }
}
