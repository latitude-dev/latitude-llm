import { uniq } from 'lodash-es'

import { and, eq, inArray } from 'drizzle-orm'

import { Workspace } from '../../browser'
import { database } from '../../client'
import {
  ConnectedEvaluationsRepository,
  EvaluationResultsRepository,
  EvaluationsRepository,
} from '../../repositories'
import { evaluations } from '../../schema'

function getIds(evalResults: string[] | string | undefined): number[] {
  if (!evalResults) return []
  if (Array.isArray(evalResults)) return evalResults.map((r) => Number(r))
  return [Number(evalResults)]
}

const MAX_ALLOWED_IDS = 100
/**
 * Given a list of IDs that can be undefined,
 * return a list of evaluation results and their evaluation
 * If the evaluation results have different evaluations, return an error
 */
export async function findManyByIdAndEvaluation(
  {
    workspace,
    ids,
    documentUuid,
  }: {
    ids: string[] | string | undefined
    workspace: Workspace
    documentUuid: string
  },
  db = database,
) {
  const repo = new EvaluationResultsRepository(workspace.id, db)
  const safeIds = getIds(ids)

  if (!safeIds.length) {
    return { evaluation: undefined, evaluationResults: undefined }
  }

  const fields = repo.scope._.selectedFields

  // NOTE: Drizzle does not allow to extends where
  // so here we are checking tenary by workspace
  const evaluationResults = await repo.scope
    .where(
      and(
        eq(evaluations.workspaceId, workspace.id),
        inArray(fields.id, safeIds),
      ),
    )
    .limit(Math.max(safeIds.length, MAX_ALLOWED_IDS))

  const evaluationIds = uniq(evaluationResults.map((r) => r.evaluationId))

  if (evaluationIds.length > 1) {
    return { evaluation: undefined, evaluationResults: undefined }
  }

  const evaluationRepo = new EvaluationsRepository(workspace.id, db)
  const evaluation = await evaluationRepo
    .find(evaluationIds[0])
    .then((r) => r.unwrap())

  const connectedRepo = new ConnectedEvaluationsRepository(workspace.id, db)
  const connected = await connectedRepo
    .filterByDocumentUuid(documentUuid)
    .then((r) => r.unwrap())

  const isConnected = !!connected.find((c) => c.evaluationId === evaluation.id)

  if (!isConnected) {
    return { evaluation: undefined, evaluationResults: undefined }
  }

  return {
    evaluation,
    evaluationResults,
  }
}
