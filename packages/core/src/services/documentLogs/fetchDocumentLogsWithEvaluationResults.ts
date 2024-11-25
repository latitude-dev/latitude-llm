import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { Commit, EvaluationDto, ProviderLogDto } from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import {
  DocumentLogsRepository,
  EvaluationResultsRepository,
  ProviderLogsRepository,
} from '../../repositories'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../repositories/documentLogsWithMetadataAndErrorsRepository'
import {
  commits,
  documentLogs,
  evaluationResults,
  providerLogs,
} from '../../schema'
import serializeProviderLog from '../providerLogs/serialize'
import { getCommitFilter } from './computeDocumentLogsWithMetadata'

const DEFAULT_PAGE_SIZE = '25'

export async function fetchDocumentLogsWithEvaluationResults(
  {
    evaluation,
    documentUuid,
    commit,
    page = '1',
    pageSize = DEFAULT_PAGE_SIZE,
  }: {
    evaluation: EvaluationDto
    documentUuid: string
    commit: Commit
    page: string | undefined
    pageSize: string | undefined
  },
  db = database,
) {
  const offset = calculateOffset(page, pageSize)
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(
    evaluation.workspaceId,
    db,
  )
  const evaluationResultsRepo = new EvaluationResultsRepository(
    evaluation.workspaceId,
    db,
  )
  const providerLogsRepo = new ProviderLogsRepository(
    evaluation.workspaceId,
    db,
  )
  const logs = await repo.scope
    .where(
      and(eq(documentLogs.documentUuid, documentUuid), getCommitFilter(commit)),
    )
    .offset(offset)
    .limit(parseInt(pageSize))
    .orderBy(desc(documentLogs.createdAt), desc(documentLogs.id))

  const evaluationResultsResult = await evaluationResultsRepo.scope.where(
    and(
      inArray(
        evaluationResults.documentLogId,
        logs.map((l) => l.id),
      ),
      eq(evaluationResults.evaluationId, evaluation.id),
    ),
  )

  const providerLogsResult = await providerLogsRepo.scope.where(
    inArray(
      providerLogs.documentLogUuid,
      logs.map((l) => l.uuid),
    ),
  )

  return logs.map((log) => {
    const providerLogs = providerLogsResult
      .filter((pl) => pl.documentLogUuid === log.uuid)
      .map(serializeProviderLog) as ProviderLogDto[]
    const result = evaluationResultsResult.find(
      (r) => r.documentLogId === log.id,
    )

    return {
      ...log,
      result,
      providerLogs,
    }
  })
}

export async function findDocumentLogWithEvaluationResultPage(
  {
    workspaceId,
    documentUuid,
    commit,
    documentLogId,
    pageSize = DEFAULT_PAGE_SIZE,
  }: {
    workspaceId: number
    documentUuid: string
    commit: Commit
    documentLogId: string
    pageSize?: string
  },
  db = database,
) {
  const documentLogsRepo = new DocumentLogsRepository(workspaceId, db)
  const result = await documentLogsRepo.find(Number(documentLogId))
  if (result.error) return undefined
  const log = result.value

  const position = (
    await db
      .select({
        count: sql`count(*)`.mapWith(Number).as('count'),
      })
      .from(documentLogs)
      .innerJoin(
        commits,
        and(eq(commits.id, documentLogs.commitId), isNull(commits.deletedAt)),
      )
      .where(
        and(
          eq(documentLogs.documentUuid, documentUuid),
          getCommitFilter(commit),
          sql`(${documentLogs.createdAt}, ${documentLogs.id}) >= (${new Date(log.createdAt).toISOString()}, ${log.id})`,
        ),
      )
  )[0]?.count
  if (position === undefined) return undefined

  const page = Math.ceil(position / parseInt(pageSize))

  return page
}
