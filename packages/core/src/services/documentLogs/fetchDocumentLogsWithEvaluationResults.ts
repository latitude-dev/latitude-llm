import { and, desc, eq, inArray } from 'drizzle-orm'

import { Commit, EvaluationDto, ProviderLogDto } from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import {
  EvaluationResultsRepository,
  ProviderLogsRepository,
} from '../../repositories'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../repositories/documentLogsWithMetadataAndErrorsRepository'
import { documentLogs, evaluationResults, providerLogs } from '../../schema'
import serializeProviderLog from '../providerLogs/serialize'
import { getCommitFilter } from './computeDocumentLogsWithMetadata'

export async function fetchDocumentLogsWithEvaluationResults(
  {
    evaluation,
    documentUuid,
    commit,
    page = '1',
    pageSize = '25',
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
    .orderBy(desc(documentLogs.createdAt))

  const evaluationResultsResult = await evaluationResultsRepo.scope.where(
    and(
      inArray(
        evaluationResults.documentLogId,
        logs.map((l) => l.id),
      ),
      eq(evaluationResults.evaluationId, evaluation.id),
    ),
  )

  const providerLogsResult = await providerLogsRepo.scope.innerJoin(
    documentLogs,
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
