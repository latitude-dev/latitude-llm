import { and, desc, eq, or } from 'drizzle-orm'

import { Commit, Evaluation } from '../../browser'
import { database } from '../../client'
import { hashContent, paginateQuery, Result } from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'
import { commits } from '../../schema'
import { getResolvedContent } from '../documents'
import { createEvaluationResultQuery } from './_createEvaluationResultQuery'

export async function computeEvaluationResultsByDocumentContent(
  {
    evaluation,
    commit,
    documentUuid,
    page,
    pageSize,
  }: {
    evaluation: Evaluation
    commit: Commit
    documentUuid: string
    page?: number
    pageSize?: number
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

  const { evaluationResultsScope, documentLogsScope, baseQuery } =
    createEvaluationResultQuery(workspaceId, db)

  const query = baseQuery
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        or(
          eq(documentLogsScope.contentHash, hashContent(resolvedContent)),
          eq(commits.id, commit.id),
        ),
      ),
    )
    .orderBy(
      desc(evaluationResultsScope.createdAt),
      desc(evaluationResultsScope.id),
    )

  const { rows, pagination } = await paginateQuery({
    searchParams: {
      page: page ? String(page) : undefined,
      pageSize: pageSize ? String(pageSize) : undefined,
    },
    dynamicQuery: query.$dynamic(),
  })

  return Result.ok({ rows, count: pagination.count })
}
