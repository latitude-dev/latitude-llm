import { eq } from 'drizzle-orm'
import {
  Commit,
  EvaluationConfiguration,
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
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
>(
  {
    evaluation,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M, C>
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
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
          ...evaluation,
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
      } as unknown as EvaluationV2<T, M, C>
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
