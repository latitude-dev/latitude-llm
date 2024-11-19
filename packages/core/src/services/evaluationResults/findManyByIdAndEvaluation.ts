import { uniq } from 'lodash-es'

import { and, eq, inArray } from 'drizzle-orm'

import { Commit, Workspace } from '../../browser'
import { database } from '../../client'
import {
  EvaluationResultsRepository,
  EvaluationsRepository,
} from '../../repositories'
import { evaluations } from '../../schema'
import { computeEvaluationResultsByDocumentContent } from './computeEvaluationResultsByDocumentContent'

function getIds(evalResults: string[] | string | undefined): number[] {
  if (!evalResults) return []
  if (Array.isArray(evalResults)) return evalResults.map((r) => Number(r))
  return [Number(evalResults)]
}

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
    commit,
    page = 1,
    pageSize = 100,
  }: {
    ids: string[] | string | undefined
    workspace: Workspace
    documentUuid: string
    commit: Commit
    page?: number
    pageSize?: number
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
  const results = await repo.scope
    .where(
      and(
        eq(evaluations.workspaceId, workspace.id),
        inArray(fields.id, safeIds),
      ),
    )
    .limit(safeIds.length)

  const evaluationIds = uniq(results.map((r) => r.evaluationId))

  if (evaluationIds.length > 1) {
    return { evaluation: undefined, evaluationResults: undefined }
  }

  const evaluationRepo = new EvaluationsRepository(workspace.id, db)
  const evaluation = await evaluationRepo
    .find(evaluationIds[0])
    .then((r) => r.unwrap())

  const evaluationResults = await computeEvaluationResultsByDocumentContent({
    evaluation,
    commit,
    documentUuid,
    page,
    pageSize,
  }).then((r) => r.unwrap())

  return {
    evaluation,
    evaluationResults,
  }
}
