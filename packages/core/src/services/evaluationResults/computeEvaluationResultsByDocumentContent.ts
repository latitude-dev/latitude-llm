import { and, desc, eq, or, sql } from 'drizzle-orm'

import { Commit, Evaluation, Workspace } from '../../browser'
import { database } from '../../client'
import { hashContent, Result } from '../../lib'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import {
  DocumentLogsRepository,
  DocumentVersionsRepository,
  EvaluationResultsRepository,
} from '../../repositories'
import { commits } from '../../schema'
import { getResolvedContent } from '../documents'

function getRepositoryScopes(workspaceId: number, db = database) {
  const evaluationResultsScope = new EvaluationResultsRepository(
    workspaceId,
    db,
  ).scope
  const documentLogsScope = new DocumentLogsRepository(workspaceId, db).scope
  return { evaluationResultsScope, documentLogsScope }
}
type Scope = ReturnType<typeof getRepositoryScopes>

function getCommonQueryConditions({
  evaluationResultsScope,
  documentLogsScope,
  evaluation,
  resolvedContent,
  commit,
}: {
  evaluationResultsScope: Scope['evaluationResultsScope']
  documentLogsScope: Scope['documentLogsScope']
  evaluation: Evaluation
  resolvedContent: string
  commit: Commit
}) {
  return and(
    eq(evaluationResultsScope.evaluationId, evaluation.id),
    or(
      eq(documentLogsScope.contentHash, hashContent(resolvedContent)),
      eq(commits.id, commit.id),
    ),
  )
}

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
  const resolvedContentResult = await getDocumentContent({
    workspaceId,
    documentUuid,
    commit,
  })
  if (resolvedContentResult.error) return resolvedContentResult

  const resolvedContent = resolvedContentResult.value

  const offset = calculateOffset(page, pageSize)
  const { evaluationResultsScope, documentLogsScope } = getRepositoryScopes(
    workspaceId,
    db,
  )
  const rows = await db
    .select({
      id: evaluationResultsScope.id,
      source: evaluationResultsScope.source,
      result: evaluationResultsScope.result,
      createdAt: evaluationResultsScope.createdAt,
    })
    .from(evaluationResultsScope)
    .innerJoin(
      documentLogsScope,
      eq(documentLogsScope.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogsScope.commitId))
    .where(
      getCommonQueryConditions({
        evaluationResultsScope,
        documentLogsScope,
        evaluation,
        resolvedContent,
        commit,
      }),
    )
    .orderBy(
      desc(evaluationResultsScope.createdAt),
      desc(evaluationResultsScope.id),
    )
    .limit(pageSize)
    .offset(offset)

  return Result.ok(rows)
}

export async function computeEvaluationResultsByDocumentContentCount(
  {
    workspace,
    commit,
    evaluation,
    documentUuid,
  }: {
    workspace: Workspace
    commit: Commit
    evaluation: Evaluation
    documentUuid: string
  },
  db = database,
) {
  const { evaluationResultsScope, documentLogsScope } = getRepositoryScopes(
    workspace.id,
    db,
  )
  const resolvedContentResult = await getDocumentContent({
    workspaceId: workspace.id,
    documentUuid,
    commit,
  })

  if (resolvedContentResult.error) return resolvedContentResult

  const resolvedContent = resolvedContentResult.value
  const countList = await db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(evaluationResultsScope)
    .innerJoin(
      documentLogsScope,
      eq(documentLogsScope.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogsScope.commitId))
    .where(
      getCommonQueryConditions({
        evaluationResultsScope,
        documentLogsScope,
        evaluation,
        resolvedContent,
        commit,
      }),
    )
  const count = countList[0]?.count ?? 0

  return Result.ok(count)
}
