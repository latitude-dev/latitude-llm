import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'

import {
  Commit,
  ErrorableEntity,
  Evaluation,
  EvaluationResultableType,
} from '../../browser'
import { database } from '../../client'
import { hashContent, Result } from '../../lib'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { DocumentVersionsRepository } from '../../repositories'
import {
  documentLogs,
  evaluationResultableBooleans,
  evaluationResultableNumbers,
  evaluationResultableTexts,
  evaluationResults,
} from '../../schema'
import { runErrors } from '../../schema/models/runErrors'
import { getResolvedContent } from '../documents'

async function getDocumentContent(
  {
    workspaceId,
    documentUuid,
    commit,
  }: { workspaceId: number; documentUuid: string; commit: Commit },
  db = database,
) {
  const documentScope = new DocumentVersionsRepository(workspaceId, db)
  const documentResult = await documentScope.getDocumentAtCommit({
    documentUuid,
    commitUuid: commit.uuid,
    projectId: commit.projectId,
  })
  if (documentResult.error) return documentResult

  return getResolvedContent({
    workspaceId,
    document: documentResult.unwrap(),
    commit,
  })
}

export async function computeEvaluationResultsByDocumentContent(
  {
    evaluation,
    commit,
    documentUuid,
    page = 1,
    pageSize = 25,
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
  const offset = calculateOffset(page, pageSize)
  const content = await buildDocumentContentHash({
    workspaceId,
    documentUuid,
    commit,
  })
  if (content.error) return content

  const rows = await db
    .select({
      id: evaluationResults.id,
      source: evaluationResults.source,
      result: sql<string>`CASE
        WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Boolean} THEN ${evaluationResultableBooleans.result}::text
        WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Number} THEN ${evaluationResultableNumbers.result}::text
        WHEN ${evaluationResults.resultableType} = ${EvaluationResultableType.Text} THEN ${evaluationResultableTexts.result}
      END`.as('result'),
      createdAt: evaluationResults.createdAt,
      sameContent: eq(documentLogs.contentHash, content.value).mapWith(Boolean),
    })
    .from(evaluationResults)
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResults.documentLogId),
    )
    .leftJoin(
      evaluationResultableBooleans,
      and(
        eq(evaluationResults.resultableType, EvaluationResultableType.Boolean),
        eq(
          evaluationResults.resultableId,
          sql`${evaluationResultableBooleans.id}`,
        ),
      ),
    )
    .leftJoin(
      evaluationResultableNumbers,
      and(
        eq(evaluationResults.resultableType, EvaluationResultableType.Number),
        eq(
          evaluationResults.resultableId,
          sql`${evaluationResultableNumbers.id}`,
        ),
      ),
    )
    .leftJoin(
      evaluationResultableTexts,
      and(
        eq(evaluationResults.resultableType, EvaluationResultableType.Text),
        eq(
          evaluationResults.resultableId,
          sql`${evaluationResultableTexts.id}`,
        ),
      ),
    )
    .leftJoin(
      runErrors,
      or(
        and(
          eq(runErrors.errorableUuid, evaluationResults.uuid),
          eq(runErrors.errorableType, ErrorableEntity.EvaluationResult),
        ),
        and(
          eq(runErrors.errorableUuid, documentLogs.uuid),
          eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        ),
      ),
    )
    .where(
      and(
        eq(evaluationResults.evaluationId, evaluation.id),
        isNull(runErrors.id),
        isNotNull(evaluationResults.resultableId),
      ),
    )
    .orderBy(desc(evaluationResults.createdAt), desc(evaluationResults.id))
    .limit(pageSize)
    .offset(offset)

  return Result.ok(rows)
}

async function buildDocumentContentHash({
  workspaceId,
  documentUuid,
  commit,
}: {
  workspaceId: number
  documentUuid: string
  commit: Commit
}) {
  const documentContent = await getDocumentContent({
    workspaceId,
    documentUuid,
    commit,
  })
  if (documentContent.error) return documentContent

  return Result.ok(hashContent(documentContent.value))
}
