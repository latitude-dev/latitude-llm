import { database } from '../../client'
import { Result } from '../../lib/Result'
import {
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
} from '../../repositories'
import { findTraceIdsByLogUuid } from '../../queries/spans/findTraceIdsByLogUuid'
import { Workspace } from '../../schema/models/types/Workspace'
import { ResultWithEvaluationV2 } from '../../schema/types'

export async function getResultsForConversation(
  {
    workspace,
    conversationId,
  }: {
    workspace: Workspace
    conversationId: string
  },
  db = database,
) {
  const traceIds = await findTraceIdsByLogUuid(
    { workspaceId: workspace.id, logUuid: conversationId },
    db,
  )

  if (traceIds.length === 0) {
    return Result.ok<ResultWithEvaluationV2[]>([])
  }

  const resultsRepository = new EvaluationResultsV2Repository(workspace.id, db)
  const resultsData = await resultsRepository
    .listByTraceIds(traceIds)
    .then((r) => r.unwrap())

  if (resultsData.length === 0) {
    return Result.ok<ResultWithEvaluationV2[]>([])
  }

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id, db)
  const commitUuids = [...new Set(resultsData.map((r) => r.commitUuid))]
  const evaluationsByCommit: Record<
    string,
    Awaited<ReturnType<typeof evaluationsRepository.listAtCommit>>['value']
  > = Object.fromEntries(
    await Promise.all(
      commitUuids.map(async (commitUuid) => [
        commitUuid,
        await evaluationsRepository
          .listAtCommit({ commitUuid })
          .then((r) => r.unwrap()),
      ]),
    ),
  )

  const resultsWithEvaluations: ResultWithEvaluationV2[] = []
  for (const result of resultsData) {
    const evaluations = evaluationsByCommit[result.commitUuid] ?? []
    const evaluation = evaluations.find(
      (e: { uuid: string }) => e.uuid === result.evaluationUuid,
    )
    if (!evaluation) continue

    resultsWithEvaluations.push({
      result,
      evaluation,
    } as ResultWithEvaluationV2)
  }

  return Result.ok<ResultWithEvaluationV2[]>(resultsWithEvaluations)
}
