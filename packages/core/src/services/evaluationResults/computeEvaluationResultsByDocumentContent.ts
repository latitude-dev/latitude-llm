import { Commit, Evaluation } from '../../browser'
import { database } from '../../client'
import { hashContent, Result } from '../../lib'
import {
  DocumentVersionsRepository,
  EvaluationResultsRepository,
} from '../../repositories'
import { getResolvedContent } from '../documents'

export async function computeEvaluationResultsByDocumentContent(
  {
    evaluation,
    commit,
    documentUuid,
  }: {
    evaluation: Evaluation
    commit: Commit
    documentUuid: string
  },
  db = database,
) {
  const { workspaceId } = evaluation
  const documentScope = new DocumentVersionsRepository(workspaceId, db)
  const documentResult = await documentScope.getDocumentAtCommit({
    documentUuid,
    commitUuid: commit.uuid,
    projectId: commit.projectId,
  })
  if (documentResult.error) return documentResult

  const resolvedContentResult = await getResolvedContent({
    workspaceId,
    document: documentResult.unwrap(),
    commit,
  })
  if (resolvedContentResult.error) return resolvedContentResult
  const resolvedContent = resolvedContentResult.unwrap()
  const evaluationResultsScope = new EvaluationResultsRepository(
    workspaceId,
    db,
  )
  const result = await evaluationResultsScope.findByContentHash({
    evaluationId: evaluation.id,
    contentHash: hashContent(resolvedContent),
  })
  if (result.error) return result

  return Result.ok(result.unwrap())
}
