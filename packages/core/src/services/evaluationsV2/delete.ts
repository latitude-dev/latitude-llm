/* eslint-disable no-unreachable */ // TODO: Delete after live to evaluateLiveLogs name has changed

import { eq } from 'drizzle-orm'
import { omit } from 'lodash-es'
import {
  Commit,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { Result, Transaction } from '../../lib'
import { EvaluationsV2Repository } from '../../repositories'
import { evaluationVersions } from '../../schema'
import { pingProjectUpdate } from '../projects'

export async function deleteEvaluationV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(
  {
    evaluation,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
  return Result.ok({ evaluation }) // TODO: Delete after live to evaluateLiveLogs name has changed
  return await Transaction.call(async (tx) => {
    const repository = new EvaluationsV2Repository(workspace.id, tx)
    const existsAnotherVersion = await repository
      .existsAnotherVersion({
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
      })
      .then((r) => r.unwrap())

    if (existsAnotherVersion) {
      const result = await tx
        .insert(evaluationVersions)
        .values({
          ...omit(evaluation, 'condition', 'threshold'),
          id: undefined,
          commitId: commit.id,
          deletedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            evaluationVersions.commitId,
            evaluationVersions.evaluationUuid,
          ],
          set: { deletedAt: new Date() },
        })
        .returning()
        .then((r) => r[0]!)

      evaluation = {
        ...result,
        uuid: result.evaluationUuid,
        versionId: result.id,
      } as unknown as EvaluationV2<T, M>
    } else {
      await tx
        .delete(evaluationVersions)
        .where(eq(evaluationVersions.id, evaluation.versionId))

      evaluation.deletedAt = new Date()
    }

    await pingProjectUpdate({ projectId: commit.projectId }, tx).then((r) =>
      r.unwrap(),
    )

    return Result.ok({ evaluation })
  }, db)
}
