import { database } from '../../client'
import { Result } from '../../lib'
import {
  EvaluationResultsRepository,
  EvaluationsRepository,
  ResultWithEvaluation,
} from '../../repositories'

export async function fetchEvaluationResultsByDocumentLogs(
  {
    workspaceId,
    documentLogIds,
  }: {
    workspaceId: number
    documentLogIds: number[]
  },
  db = database,
) {
  documentLogIds = [...new Set(documentLogIds)]

  const evaluationsRepository = new EvaluationsRepository(workspaceId, db)
  const resultsRepository = new EvaluationResultsRepository(workspaceId, db)

  const results = await resultsRepository
    .findByDocumentLogIds(documentLogIds)
    .then((r) => r.unwrap())

  const evaluations = await evaluationsRepository
    .filterById([...new Set(results.map((r) => r.evaluationId))])
    .then((r) => r.unwrap())

  const resultsByDocumentLog = documentLogIds.reduce<
    Record<number, ResultWithEvaluation[]>
  >((acc, documentLogId) => {
    acc[documentLogId] = results
      .filter((r) => r.documentLogId === documentLogId)
      .map((result) => ({
        result: result,
        evaluation: evaluations.find((e) => e.id === result.evaluationId)!,
      }))
    return acc
  }, {})

  return Result.ok(resultsByDocumentLog)
}
